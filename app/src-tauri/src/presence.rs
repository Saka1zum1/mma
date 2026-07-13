//! Discord Rich Presence (opt-in). Thin primitive: JS composes the activity
//! payload -- respecting the user's privacy setting -- and pushes it here; this
//! module only owns the process-global IPC client and forwards. Every path is a
//! silent no-op when Discord isn't running, so nothing here ever surfaces an error.

use crate::types::AppResult;
use discord_rich_presence::{
    activity::{Activity, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use std::sync::Mutex;

const CLIENT_ID: &str = "1525958540181901475";

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresenceActivity {
    pub details: Option<String>,
    pub state: Option<String>,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
    /// Unix seconds; Discord renders an "elapsed" timer counting up from here.
    pub start: Option<i64>,
}

/// Run `f` against a connected client, lazily connecting first. Returns early
/// (no-op) if Discord isn't reachable. If the call fails mid-session (pipe broke
/// on a Discord restart), the client is dropped so the next call reconnects.
fn with_client<F>(f: F)
where
    F: FnOnce(&mut DiscordIpcClient) -> Result<(), Box<dyn std::error::Error>>,
{
    let Ok(mut guard) = CLIENT.lock() else { return };
    if guard.is_none() {
        let Ok(mut client) = DiscordIpcClient::new(CLIENT_ID) else {
            return;
        };
        if client.connect().is_err() {
            return; // Discord not running
        }
        *guard = Some(client);
    }
    let client = guard.as_mut().expect("just set");
    if f(client).is_err() {
        let _ = client.close();
        *guard = None;
    }
}

#[tauri::command]
#[specta::specta]
pub fn discord_presence_set(activity: PresenceActivity) -> AppResult<()> {
    with_client(|client| {
        let mut act = Activity::new();
        if let Some(d) = activity.details.as_deref() {
            act = act.details(d);
        }
        if let Some(s) = activity.state.as_deref() {
            act = act.state(s);
        }
        let mut assets = Assets::new();
        if let Some(v) = activity.large_image.as_deref() {
            assets = assets.large_image(v);
        }
        if let Some(v) = activity.large_text.as_deref() {
            assets = assets.large_text(v);
        }
        if let Some(v) = activity.small_image.as_deref() {
            assets = assets.small_image(v);
        }
        if let Some(v) = activity.small_text.as_deref() {
            assets = assets.small_text(v);
        }
        act = act.assets(assets);
        if let Some(ts) = activity.start {
            act = act.timestamps(Timestamps::new().start(ts));
        }
        client.set_activity(act)?;
        Ok(())
    });
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn discord_presence_clear() -> AppResult<()> {
    with_client(|client| {
        client.clear_activity()?;
        Ok(())
    });
    Ok(())
}

/// Clear presence and drop the connection on app exit.
pub fn shutdown() {
    if let Ok(mut guard) = CLIENT.lock() {
        if let Some(mut client) = guard.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }
}
