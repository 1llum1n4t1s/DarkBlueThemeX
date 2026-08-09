# Privacy Policy - DarkBlueThemeX

Last Updated: February 18, 2026

## Overview

"DarkBlueThemeX" (the "Extension") is a Chrome extension that converts X's (formerly Twitter) dark theme (Lights Out) into the classic DarkBlue (Dim) theme. This Extension respects user privacy and does not collect any personal information.

## Permissions Used

### storage
- Used to save the toggle (enabled/disabled) state
- The only data stored under this permission is a single boolean value (true/false)
- Uses Chrome's sync storage so the setting is synchronized across devices signed into the same account
- Separately, display-related flags are stored in `localStorage` on X pages, which requires no permission (see "Data Storage")

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

The Extension stores only the following operational settings. None of them contain personally identifiable information, and none are transmitted externally.

| Location | Data | Purpose |
|---|---|---|
| `chrome.storage.sync` | Toggle enabled/disabled state (a single boolean value) | Persists your setting. Synchronized across devices through Chrome's account sync feature |
| `localStorage` on x.com / twitter.com | Flag for whether the theme was active last time (`darkbluethemex_was_active`) | Prevents the brief flash of the black theme on page load (FOUC) by deciding colors without waiting for the asynchronous settings read |
| `localStorage` on x.com / twitter.com | Debug logging flag (`dbtx_debug`, unset by default) | Read only when you set it yourself while troubleshooting |

The `localStorage` data is stored only within X pages and can be cleared at any time by clearing your browsing data.

## Third-Party Sharing

Since this Extension does not collect any data, no data is shared with third parties.

## Contact

For questions regarding this privacy policy, please open an Issue on the GitHub repository.

## Changelog

- February 18, 2026: Initial release
