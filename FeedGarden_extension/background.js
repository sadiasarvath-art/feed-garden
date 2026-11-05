// background.js - tiny helper.
// A web page cannot close its own tab, so content.js asks this file to do it
// when I choose "Leave Instagram".
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "closeTab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});
