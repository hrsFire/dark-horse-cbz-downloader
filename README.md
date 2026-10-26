# Dark Horse CBZ Downloader

A userscript that downloads available comic pages from [Dark Horse Digital](https://digital.darkhorse.com/) and packages them into **CBZ archives** for use with compatible comic book readers.

## Features

- **One-click CBZ downloads** from supported Dark Horse Digital comic reader pages.
- **Bookshelf integration** adds a `Download CBZ` button to detected comic entries.
- **Automatic page retrieval** using the comic's available page manifest.
- **CBZ archive generation** with [JSZip](https://stuk.github.io/jszip/).
- **Ordered page filenames** (`0001.jpg`, `0002.jpg`, etc.) to preserve reading order.
- **Image format detection** for JPEG, PNG, GIF, and WebP images.
- **Download progress indicators** for page retrieval and archive generation.
- **Error handling and console logging** to help diagnose failed downloads.
- **Filename sanitization** to create filesystem-friendly archive names.

## Requirements

- A modern desktop browser compatible with a userscript manager.
- A userscript manager, such as:
  - [Tampermonkey](https://www.tampermonkey.net/)
  - [Violentmonkey](https://violentmonkey.github.io/)
- Access to [Dark Horse Digital](https://digital.darkhorse.com/) and the comic you want to download.
- A browser session in which the comic's page manifest and image URLs are available.

## Installation

1. Install a compatible userscript manager in your browser.
2. Create a new userscript in the manager's dashboard.
3. Replace the template with the contents of the downloader script.
4. Save the script and ensure it is enabled.
5. Open Dark Horse Digital and navigate to your bookshelf or a supported comic reader page.

The script loads JSZip automatically from Cloudflare's CDN through the `@require` directive.

## Usage

### Download from your bookshelf

1. Visit your [Dark Horse Digital bookshelf](https://digital.darkhorse.com/bookshelf).
2. Locate a comic with a detectable book ID.
3. Click **Download CBZ**.
4. The script navigates to the comic reader and attempts to download the available pages.
5. Once the archive is generated, your browser downloads the resulting `.cbz` file.

### Download from the comic reader

1. Open the comic normally and wait for its page manifest to load.
2. To trigger the automated download flow, navigate to the reader URL with the `#download` fragment appended.

   Example:

   `https://digital.darkhorse.com/read/BOOK_ID#download`

3. The script waits for the page manifest, adds a download button, and starts downloading the available pages.
4. Wait for the page download and CBZ generation process to finish.

**Note:** The script's reader automation is currently triggered by the `#download` URL fragment. It does not automatically add a download button to every reader page opened without that fragment.

## Output

The downloaded file uses the comic's title when available, with an `.cbz` extension.

Example:

```text
My Comic Title.cbz
```

The archive contains a `pages/` directory with sequentially numbered image files:

```text
My Comic Title.cbz
└── pages/
    ├── 0001.jpg
    ├── 0002.jpg
    ├── 0003.jpg
    └── ...
```

The actual image extensions depend on the detected image formats. CBZ is a ZIP-based comic book archive format supported by many comic readers.

## How It Works

1. Reads the comic's available page manifest from the reader.
2. Extracts page image URLs from supported manifest fields.
3. Validates the URLs against the configured Dark Horse Digital and CloudFront hostnames.
4. Retrieves each image using `GM_xmlhttpRequest`.
5. Stores the downloaded images in sequential order using JSZip.
6. Generates a ZIP archive without additional compression and saves it with a `.cbz` extension.

The script uses userscript-manager APIs for cross-origin image requests. It does not implement authentication, decrypt protected content, or resolve unavailable image URL templates.

## Troubleshooting

### "Comic manifest not found"

Open the comic normally, wait for it to finish loading, and try again. The reader must expose a manifest that the script can access.

### "No pages found in the manifest"

The site's manifest structure may have changed, or the comic's page list may not be available. Check the browser console for diagnostic information.

### "No valid image URL found for page entry"

The manifest may contain an unresolved URL template or a URL hosted on an unsupported domain. The script only accepts image URLs from the configured Dark Horse Digital and CloudFront hosts.

### "JSZip failed to load"

Check your internet connection and ensure the CDN hosting JSZip is accessible. Refresh the page and try again.

### A download fails or stalls

- Check that you are signed in and can view the comic normally.
- Check your browser console for errors prefixed with `[Dark Horse Downloader]`.
- Verify that the comic's image URLs remain accessible.
- Check whether the website has changed its reader or manifest implementation.

### The bookshelf button does not appear

The script relies on detectable bookshelf elements and book IDs. Changes to the website's HTML structure may prevent the button from appearing.

## Permissions

The userscript requests the following capabilities:

| Permission | Purpose |
|---|---|
| `GM_xmlhttpRequest` | Retrieve comic page images from supported hosts. |
| `GM_download` | Declared in the script metadata; currently not used by the implementation. |
| `@connect digital.darkhorse.com` | Permit requests to the Dark Horse Digital domain. |
| `@connect drhq3xefn6rcs.cloudfront.net` | Permit requests to a configured CloudFront host. |
| `@connect cloudfront.net` | Declare CloudFront domain access for the userscript manager. |
| `@require JSZip` | Load the library used to generate CBZ archives. |

## Limitations

- Only pages exposed through an accessible manifest with usable image URLs can be downloaded.
- Website updates may break manifest detection, bookshelf integration, or image URL resolution.
- The script downloads pages sequentially, so large comics may take some time.
- Archive generation requires browser memory for the downloaded pages and generated archive.
- The script does not guarantee that every comic, page, or account will be supported.
- JSZip is loaded from an external CDN, so its availability is required.
- The script is intended for the website's current page structure and may need maintenance if it changes.

## Responsible Use

This project is an independent browser userscript and is not affiliated with, endorsed by, or sponsored by Dark Horse Comics or Dark Horse Digital.

Use it only for content you are authorized to download. Respect applicable copyright laws, the site's terms of service, and the rights of creators and publishers. Downloading a comic for personal use does not necessarily grant permission to redistribute, share, or republish it.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

You may use, modify, and redistribute this software under the terms of the license. Distributed modified versions must comply with the GPL-3.0 requirements. See the [LICENSE](LICENSE) file for details.
