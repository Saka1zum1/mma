//! Conversion layer between [`Location`] structs and Arrow [`RecordBatch`]es.
//!
//! Every persistent location passes through this module on read and write.
//! The canonical column order and types are defined by [`location_schema`].

use std::sync::Arc;

use arrow::array::{
    Array, ArrayRef, Float64Array, GenericListBuilder, ListArray, RecordBatch,
    StringArray, UInt32Array, UInt32Builder, UInt8Array,
};
use arrow::datatypes::{DataType, Field, Schema};

use crate::types::Location;

/// The canonical Arrow schema for location data. Column order here determines
/// the positional indices used by [`row_to_location`] and must stay in sync.
///
/// `tags` is a `List<UInt32>` (variable-length per row). `extra` and `pano_id`
/// are nullable UTF-8; all other columns are non-nullable.
pub fn location_schema() -> Schema {
    Schema::new(vec![
        Field::new("id", DataType::UInt32, false),
        Field::new("lat", DataType::Float64, false),
        Field::new("lng", DataType::Float64, false),
        Field::new("heading", DataType::Float64, false),
        Field::new("pitch", DataType::Float64, false),
        Field::new("zoom", DataType::Float64, false),
        Field::new("pano_id", DataType::Utf8, true),
        Field::new("flags", DataType::UInt32, false),
        Field::new(
            "tags",
            DataType::List(Arc::new(Field::new("item", DataType::UInt32, true))),
            false,
        ),
        Field::new("extra", DataType::Utf8, true),
        // TODO: migrate ISO-string timestamps to integer epoch (~28B -> 4-8B/row, keeps mmap
        // zero-copy, drops iso_to_unix parsing in date filters). i64 millis (Timestamp convention)
        // or u32 seconds if second precision suffices. Touches LocView downcast + import/export.
        Field::new("created_at", DataType::Utf8, false),
        Field::new("modified_at", DataType::Utf8, true),
    ])
}

/// Serialize a slice of [`Location`]s into a single Arrow [`RecordBatch`].
///
/// `extra` fields are JSON-stringified. Panics if the resulting columns don't
/// match [`location_schema`] (indicates a code bug, not a data problem).
pub fn locations_to_batch(locs: &[Location]) -> RecordBatch {
    let n = locs.len();

    let ids = UInt32Array::from(locs.iter().map(|l| l.id).collect::<Vec<_>>());
    let lats = Float64Array::from(locs.iter().map(|l| l.lat).collect::<Vec<_>>());
    let lngs = Float64Array::from(locs.iter().map(|l| l.lng).collect::<Vec<_>>());
    let headings = Float64Array::from(locs.iter().map(|l| l.heading).collect::<Vec<_>>());
    let pitches = Float64Array::from(locs.iter().map(|l| l.pitch).collect::<Vec<_>>());
    let zooms = Float64Array::from(locs.iter().map(|l| l.zoom).collect::<Vec<_>>());
    let pano_ids: StringArray = locs
        .iter()
        .map(|l| l.pano_id.as_deref())
        .collect();
    let flags = UInt32Array::from(locs.iter().map(|l| l.flags).collect::<Vec<_>>());

    let mut tags_builder =
        GenericListBuilder::<i32, UInt32Builder>::with_capacity(UInt32Builder::new(), n);
    for loc in locs {
        let values = tags_builder.values();
        for &tag in &loc.tags {
            values.append_value(tag);
        }
        tags_builder.append(true);
    }
    let tags = tags_builder.finish();

    let extras: StringArray = locs
        .iter()
        .map(|l| l.extra.as_ref().map(|e| serde_json::to_string(e).unwrap()))
        .collect();

    let created_ats: StringArray = locs.iter().map(|l| Some(l.created_at.as_str())).collect();
    let modified_ats: StringArray = locs.iter().map(|l| l.modified_at.as_deref()).collect();

    let schema = Arc::new(location_schema());
    let columns: Vec<ArrayRef> = vec![
        Arc::new(ids),
        Arc::new(lats),
        Arc::new(lngs),
        Arc::new(headings),
        Arc::new(pitches),
        Arc::new(zooms),
        Arc::new(pano_ids),
        Arc::new(flags),
        Arc::new(tags),
        Arc::new(extras),
        Arc::new(created_ats),
        Arc::new(modified_ats),
    ];

    RecordBatch::try_new(schema, columns).expect("schema matches columns")
}

/// Extract a single [`Location`] from row `idx` of a batch.
///
/// Accesses columns by positional index (must match [`location_schema`] order).
/// Nullable `extra` is deserialized from its JSON string; malformed JSON yields `None`.
pub fn row_to_location(batch: &RecordBatch, idx: usize) -> Location {
    let id = batch
        .column(0)
        .as_any()
        .downcast_ref::<UInt32Array>()
        .unwrap()
        .value(idx);
    let lat = batch.column(1).as_any().downcast_ref::<Float64Array>().unwrap().value(idx);
    let lng = batch.column(2).as_any().downcast_ref::<Float64Array>().unwrap().value(idx);
    let heading = batch.column(3).as_any().downcast_ref::<Float64Array>().unwrap().value(idx);
    let pitch = batch.column(4).as_any().downcast_ref::<Float64Array>().unwrap().value(idx);
    let zoom = batch.column(5).as_any().downcast_ref::<Float64Array>().unwrap().value(idx);
    let pano_id_col = batch.column(6).as_any().downcast_ref::<StringArray>().unwrap();
    let pano_id = if pano_id_col.is_null(idx) {
        None
    } else {
        Some(pano_id_col.value(idx).to_string())
    };
    let flags = batch.column(7).as_any().downcast_ref::<UInt32Array>().unwrap().value(idx);
    let tags_col = batch.column(8).as_any().downcast_ref::<ListArray>().unwrap();
    let tags_arr = tags_col.value(idx);
    let tags_u32 = tags_arr.as_any().downcast_ref::<UInt32Array>().unwrap();
    let tags: Vec<u32> = (0..tags_u32.len()).map(|i| tags_u32.value(i)).collect();
    let extra_col = batch.column(9).as_any().downcast_ref::<StringArray>().unwrap();
    let extra = if extra_col.is_null(idx) {
        None
    } else {
        serde_json::from_str(extra_col.value(idx)).ok()
    };
    let created_at = batch
        .column(10)
        .as_any()
        .downcast_ref::<StringArray>()
        .unwrap()
        .value(idx)
        .to_string();
    let modified_at = {
        let col = batch.column(11).as_any().downcast_ref::<StringArray>().unwrap();
        if col.is_null(idx) { None } else { Some(col.value(idx).to_string()) }
    };

    Location {
        id,
        lat,
        lng,
        heading,
        pitch,
        zoom,
        pano_id,
        flags,
        tags,
        extra,
        created_at,
        modified_at,
    }
}

/// Materialize every row of a batch into a `Vec<Location>`.
pub fn batch_to_locations(batch: &RecordBatch) -> Vec<Location> {
    (0..batch.num_rows()).map(|i| row_to_location(batch, i)).collect()
}

// ---------------------------------------------------------------------------
// VCS delta batches
// ---------------------------------------------------------------------------

/// `op` column code for a location removed by a commit.
pub const OP_REMOVED: u8 = 0;
/// `op` column code for a location created (or updated) by a commit.
pub const OP_CREATED: u8 = 1;

/// Schema for a VCS delta file: the location columns plus a trailing `op` column
/// (`OP_REMOVED`/`OP_CREATED`) distinguishing the two sides of the delta.
pub fn delta_schema() -> Schema {
    let mut fields: Vec<arrow::datatypes::FieldRef> = location_schema().fields().iter().cloned().collect();
    fields.push(Arc::new(Field::new("op", DataType::UInt8, false)));
    Schema::new(fields)
}

/// Serialize a commit delta (`created` + `removed` locations) into one delta batch.
/// Removed rows come first, then created; the `op` column tags each.
pub fn delta_to_batch(created: &[Location], removed: &[Location]) -> RecordBatch {
    let mut all = Vec::with_capacity(created.len() + removed.len());
    all.extend_from_slice(removed);
    all.extend_from_slice(created);

    let base = locations_to_batch(&all);
    let mut ops: Vec<u8> = Vec::with_capacity(all.len());
    ops.resize(removed.len(), OP_REMOVED);
    ops.resize(removed.len() + created.len(), OP_CREATED);

    let mut columns: Vec<ArrayRef> = base.columns().to_vec();
    columns.push(Arc::new(UInt8Array::from(ops)));
    RecordBatch::try_new(Arc::new(delta_schema()), columns).expect("delta schema matches columns")
}

/// Split a delta batch back into `(created, removed)` location vectors.
pub fn batch_to_delta(batch: &RecordBatch) -> (Vec<Location>, Vec<Location>) {
    let ops = batch
        .column(batch.num_columns() - 1)
        .as_any()
        .downcast_ref::<UInt8Array>();
    let mut created = Vec::new();
    let mut removed = Vec::new();
    for i in 0..batch.num_rows() {
        let loc = row_to_location(batch, i);
        match ops.map(|a| a.value(i)).unwrap_or(OP_CREATED) {
            OP_REMOVED => removed.push(loc),
            _ => created.push(loc),
        }
    }
    (created, removed)
}

#[cfg(test)]
#[path = "arrow_bridge.test.rs"]
mod tests;
