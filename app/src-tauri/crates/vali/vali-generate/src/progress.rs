// Vendored from vali-rs @ 3b22983. Do not edit; regenerate instead.

#[derive(Debug, Clone)]
pub enum Event {
    WorkItems { total: usize },
    WorkItemDone {
        country_code: String,
        subdivision_code: Option<String>,
        done: usize,
        total: usize,
    },
    CountryDownloadStarted {
        country_code: String,
        files: usize,
        bytes: i64,
        updates: bool,
    },
    FileDownloaded { country_code: String, name: String, bytes: i64 },
}
pub type Progress<'a> = &'a (dyn Fn(Event) + Sync);
pub(crate) fn emit(progress: Option<Progress<'_>>, event: Event) {
    if let Some(p) = progress {
        p(event);
    }
}
