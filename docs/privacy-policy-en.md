# Privacy Policy - DarkBlueThemeX

Last Updated: August 28, 2026

## Overview

"DarkBlueThemeX" (the "Extension") is a browser extension that converts X's (formerly Twitter) dark theme (Lights Out) into the classic DarkBlue (Dim) theme. This Extension respects user privacy and collects no personal information as part of the theme conversion. The only exception is the contact form you submit yourself (see "Contact form").

## Permissions Used

### storage
- Used to save the toggle (enabled/disabled) state
- The only data stored under this permission is a single boolean value (true/false)
- Uses Chrome's sync storage so the setting is synchronized across devices signed into the same account
- Separately, display-related flags and the contact authentication session are stored in `localStorage`, which requires no permission (see "Data Storage")

### activeTab
- Used to check the state of the active tab from the popup
- Determines whether the current tab is an X page and displays the theme application status

### Host Permissions (x.com, twitter.com)
- Required to apply theme conversion CSS to X pages
- The theme conversion feature operates only on these websites

### Kagayoi Support Host Permission (support.kagayoi.com)
- Used only to communicate with the API that authenticates and submits the contact form
- On Chrome, Edge, Brave, and Firefox, this is declared as an optional host permission. The browser asks for it when you press "Contact support"; if you decline, it is not granted and the theme conversion continues to work

### Optional Firefox Data Collection Permissions
- The email address and optional name are declared as `personallyIdentifyingInfo`; the six-digit verification code and authentication session as `authenticationInfo`; the subject and message as `personalCommunications`; and the product ID, extension version, and locale as `technicalAndInteraction`
- All are optional. Firefox asks for your consent when you press "Contact support"; declining does not affect theme conversion

## Data Collection

This Extension never collects any of the following automatically:
- Browsing history
- Cookies
- Location data
- Analytics data

Your name and email address are received only when you type them into the contact form and submit it. If you do not use the form, they are never received.

## External Communication

Apart from the contact form below, this Extension does **not** communicate with any external servers. All theme conversion is performed entirely within the browser.

## Contact form

Only when you press "Contact support" in the settings popup and submit the form does the Extension send the following to Kagayoi Support (`https://support.kagayoi.com`). No such request happens unless you press the button.

- The email address, optional name, inquiry category, subject, and message you entered
- Product ID, extension version, and locale

On first use, the six-digit code delivered by email is sent to Kagayoi Support to verify you. After verification, Kagayoi Support stores the inquiry and replies so that you and support staff can access them. Nothing you view on X (twitter.com) and none of your theme settings are sent.

## Data Storage

The Extension stores the following operational settings and, if you use the contact form, an authentication session.

| Location | Data | Purpose |
|---|---|---|
| `chrome.storage.sync` | Toggle enabled/disabled state (a single boolean value) | Persists your setting. Synchronized across devices through Chrome's account sync feature |
| `localStorage` on x.com / twitter.com | Flag for whether the theme was active last time (`darkbluethemex_was_active`) | Prevents the brief flash of the black theme on page load (FOUC) by deciding colors without waiting for the asynchronous settings read |
| `localStorage` on x.com / twitter.com | Debug logging flag (`dbtx_debug`, unset by default) | Read only when you set it yourself while troubleshooting |
| Extension `localStorage` | Email address, access token, and expiration time (`kagayoi-support-session`) | Lets Kagayoi Support recognize your authenticated session without asking for a verification code for every inquiry. It is not synchronized between browsers |

An expired authentication session is removed the next time you use the contact form. You can also remove these `localStorage` entries by clearing browser or extension data.

## Third-Party Sharing

Apart from what you submit through the contact form, this Extension collects no data, so there is nothing to share with third parties. Contact form content goes to the developer's (Kagayoi) support desk and is never passed to advertising or analytics third parties.

## Contact

For questions regarding this privacy policy, please open an Issue on the GitHub repository.

## Changelog

- August 28, 2026: Documented optional contact permissions and authentication session storage
- February 18, 2026: Initial release
