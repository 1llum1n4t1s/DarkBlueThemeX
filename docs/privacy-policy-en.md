# Privacy Policy - DarkBlueThemeX

Last Updated: February 18, 2026

## Overview

"DarkBlueThemeX" (the "Extension") is a Chrome extension that converts X's (formerly Twitter) dark theme (Lights Out) into the classic DarkBlue (Dim) theme. This Extension respects user privacy and does not collect any personal information.

## Permissions Used

### storage
- Used to save the toggle (enabled/disabled) state
- The only data stored is a single boolean value (true/false)
- Uses Chrome's sync storage so the setting is synchronized across devices signed into the same account

### activeTab
- Used to check the state of the active tab from the popup
- Determines whether the current tab is an X page and displays the theme application status

### Host Permissions (x.com, twitter.com)
- Required to apply theme conversion CSS to X pages
- The Extension does not operate on any other websites

## Data Collection

This Extension does **not** collect any of the following data:
- Personal information (name, email address, etc.)
- Browsing history
- Cookies
- Location data
- Analytics data

## External Communication

This Extension does **not** communicate with any external servers. All processing is performed entirely within the browser.

## Data Storage

Only the toggle enabled/disabled state (a single boolean value) is stored via the `chrome.storage.sync` API. This data is synchronized through Chrome's account sync feature but is never transmitted to any external service.

## Third-Party Sharing

Since this Extension does not collect any data, no data is shared with third parties.

## Contact

For questions regarding this privacy policy, please open an Issue on the GitHub repository.

## Changelog

- February 18, 2026: Initial release
