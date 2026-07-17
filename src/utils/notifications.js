function notifyTriggered() {
  chrome.notifications.create("claude-maxer-triggered", {
    type: "basic",
    iconUrl: "assets/icon128.png",
    title: "Claude Maxer",
    message: "Window triggered! Your reset clock has started.",
    priority: 1
  });
}

function notifyFailed(reason) {
  chrome.notifications.create("claude-maxer-failed", {
    type: "basic",
    iconUrl: "assets/icon128.png",
    title: "Claude Maxer - Failed",
    message: reason || "Could not send message to Claude. Are you logged in?",
    priority: 2
  });
}