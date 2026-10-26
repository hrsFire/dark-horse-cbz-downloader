// ==UserScript==
// @name         Dark Horse CBZ Downloader
// @namespace    hrsFire
// @version      1.0
// @description  Download available Dark Horse Digital comic pages as CBZ archives.
// @match        https://digital.darkhorse.com/read/*
// @match        https://digital.darkhorse.com/bookshelf*
// @connect      digital.darkhorse.com
// @connect      drhq3xefn6rcs.cloudfront.net
// @connect      cloudfront.net
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const PREFIX = "[Dark Horse Downloader]";
    const BUTTON_CLASS = "dh-downloader-button";
    const activeDownloads = new Set();

    function getBookId() {
        const match = location.pathname.match(/\/read\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    function getManifest() {
        try {
            if (typeof book_manifest !== "undefined" && book_manifest) {
                return book_manifest;
            }
        } catch (_) {}

        return window.book_manifest || window.bookManifest || null;
    }

    function getPages(manifest) {
        if (Array.isArray(manifest?.pages)) return manifest.pages;
        if (Array.isArray(manifest?.book?.pages)) {
            return manifest.book.pages;
        }
        return [];
    }

    function safeFilename(value) {
        return String(value || "dark-horse-comic")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .replace(/[. ]+$/g, "")
            .slice(0, 150) || "dark-horse-comic";
    }

    function resolveImageUrl(page, manifest) {
        if (!page || typeof page !== "object") {
            throw new Error("Invalid page entry in manifest.");
        }

        const candidates = [
            page.src_image,
            page.url,
            page.image_url,
            page.src
        ];

        for (const candidate of candidates) {
            if (typeof candidate !== "string" || !candidate.trim()) {
                continue;
            }

            const value = candidate.trim();

            try {
                let url;

                if (/^https?:\/\//i.test(value)) {
                    url = new URL(value);
                } else if (value.startsWith("//")) {
                    url = new URL(location.protocol + value);
                } else {
                    if (/\{[^}]+\}/.test(value)) {
                        console.warn(PREFIX, "Skipping unresolved URL template:", value);
                        continue;
                    }

                    if (!manifest.base_url) continue;

                    const base = new URL(
                        manifest.base_url,
                        location.href
                    );

                    if (/\{[^}]+\}/.test(base.href)) {
                        console.warn(PREFIX, "Skipping unresolved base URL:", base.href);
                        continue;
                    }

                    url = new URL(value, base);
                }

                if (!["http:", "https:"].includes(url.protocol)) {
                    continue;
                }

                const host = url.hostname.toLowerCase();
                const allowedHost =
                    host === "digital.darkhorse.com" ||
                    host === "drhq3xefn6rcs.cloudfront.net" ||
                    host.endsWith(".cloudfront.net");

                if (!allowedHost) {
                    console.warn(PREFIX, "Skipping unexpected image host:", host);
                    continue;
                }

                return url.href;
            } catch (error) {
                console.warn(PREFIX, "Unable to resolve image URL:", value, error);
            }
        }

        throw new Error(
            "No valid image URL found for page entry. " +
            "The manifest may contain a protected-page API template " +
            "instead of a direct image URL."
        );
    }

    function requestImage(url) {
        return new Promise((resolve, reject) => {
            console.log(PREFIX, "Requesting image:", url);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: "arraybuffer",
                timeout: 45000,

                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(
                            "Image request failed with HTTP " +
                            response.status + ": " + url
                        ));
                        return;
                    }

                    if (!response.response) {
                        reject(new Error("Empty image response: " + url));
                        return;
                    }

                    resolve(response.response);
                },

                onerror() {
                    reject(new Error("Network error requesting image: " + url));
                },

                ontimeout() {
                    reject(new Error("Timed out requesting image: " + url));
                }
            });
        });
    }

    function getImageExtension(url, data) {
        try {
            const pathname = new URL(url).pathname;
            const match = pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);

            if (match) return "." + match[1].toLowerCase();
        } catch (_) {}

        const b = new Uint8Array(data.slice(0, 12));

        if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
            return ".jpg";
        }

        if (
            b[0] === 0x89 && b[1] === 0x50 &&
            b[2] === 0x4E && b[3] === 0x47
        ) {
            return ".png";
        }

        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
            return ".gif";
        }

        if (
            b[0] === 0x52 && b[1] === 0x49 &&
            b[2] === 0x46 && b[3] === 0x46 &&
            b[8] === 0x57 && b[9] === 0x45 &&
            b[10] === 0x42 && b[11] === 0x50
        ) {
            return ".webp";
        }

        return ".jpg";
    }

    function saveBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = "none";

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }

    async function downloadComic(button) {
        if (activeDownloads.has(button)) return;

        activeDownloads.add(button);
        const originalLabel = button.textContent;
        button.disabled = true;

        try {
            if (typeof JSZip === "undefined") {
                throw new Error("JSZip failed to load. Refresh and try again.");
            }

            const manifest = getManifest();

            if (!manifest) {
                throw new Error(
                    "Comic manifest not found. Open the comic normally, " +
                    "wait for it to load, and try again."
                );
            }

            const pages = getPages(manifest);

            if (!pages.length) {
                throw new Error(
                    "No pages found in the manifest. " +
                    "The site's manifest structure may have changed."
                );
            }

            console.log(PREFIX, "Manifest keys:", Object.keys(manifest));
            console.log(PREFIX, "Page count:", pages.length);
            console.log(PREFIX, "First page entry:", pages[0]);

            const zip = new JSZip();
            const folder = zip.folder("pages");

            for (let i = 0; i < pages.length; i++) {
                button.textContent =
                    "Downloading " + (i + 1) + "/" + pages.length + "…";

                const url = resolveImageUrl(pages[i], manifest);
                const data = await requestImage(url);
                const ext = getImageExtension(url, data);
                const filename = String(i + 1).padStart(4, "0") + ext;

                folder.file(filename, data);
                console.log(PREFIX, "Downloaded page", i + 1, "of", pages.length);

                if ((i + 1) % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(PREFIX, "All pages downloaded. Starting CBZ generation...");
            button.textContent = "Building CBZ (0%)…";

            let lastProgress = 0;
            const progressUpdate = (metadata) => {
                const percent = Math.round(metadata.percent);
                if (percent !== lastProgress && percent % 5 === 0) {
                    console.log(PREFIX, "CBZ build progress:", percent + "%");
                    button.textContent = `Building CBZ (${percent}%)…`;
                }
                lastProgress = percent;
            };

            console.log(PREFIX, "Calling zip.generateAsync()...");
            const startTime = Date.now();

            const blob = await zip.generateAsync(
                {
                    type: "blob",
                    compression: "STORE"
                },
                progressUpdate
            );

            const endTime = Date.now();
            console.log(PREFIX, "CBZ generation completed in", (endTime - startTime) / 1000, "seconds");
            console.log(PREFIX, "Blob size:", blob.size, "bytes");

            const title = safeFilename(
                manifest.title ||
                manifest.name ||
                document.title ||
                getBookId() ||
                "dark-horse-comic"
            );

            console.log(PREFIX, "Saving blob as:", title + ".cbz");
            saveBlob(blob, title + ".cbz");
            button.textContent = "Downloaded!";
            console.log(PREFIX, "Archive created:", title + ".cbz");
        } catch (error) {
            console.error(PREFIX, "Download failed:", error);
            console.error(PREFIX, "Stack trace:", error.stack);

            alert(
                "Dark Horse Downloader failed:\n\n" +
                error.message +
                "\n\nOpen the browser console for details."
            );

            button.textContent = "Download failed";
        } finally {
            activeDownloads.delete(button);
            button.disabled = false;

            setTimeout(() => {
                if (button.isConnected) {
                    button.textContent = originalLabel;
                }
            }, 3000);
        }
    }

    function createButton(label) {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = label;
        button.className = BUTTON_CLASS;

        Object.assign(button.style, {
            display: "inline-block",
            margin: "8px 4px",
            padding: "8px 12px",
            background: "#222",
            color: "#fff",
            border: "1px solid #666",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            position: "relative",
            zIndex: "9999"
        });

        return button;
    }

    function findBookId(element) {
        const values = [
            element.getAttribute("data-book-id"),
            element.getAttribute("data-id"),
            element.dataset?.bookId,
            element.dataset?.id
        ];

        for (const value of values) {
            if (value && /^[a-zA-Z0-9_-]+$/.test(value)) {
                return value;
            }
        }

        for (const anchor of element.querySelectorAll("a[href]")) {
            const match = anchor.href.match(/\/read\/([^/?#]+)/);
            if (match) return match[1];
        }

        return null;
    }

    function addBookshelfButtons() {
        if (!location.pathname.startsWith("/bookshelf")) return;

        const items = new Set();

        document.querySelectorAll(
            ".bookshelf-item, [data-book-id], [data-id]"
        ).forEach(item => items.add(item));

        for (const item of items) {
            if (item.querySelector("." + BUTTON_CLASS)) continue;

            const bookId = findBookId(item);
            if (!bookId) continue;

            const button = createButton("Download CBZ");

            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                location.href =
                    "https://digital.darkhorse.com/read/" +
                    encodeURIComponent(bookId) +
                    "#download";
            });

            item.appendChild(button);
        }
    }

    function setupReader() {
        if (!location.pathname.startsWith("/read/")) return;
        if (location.hash !== "#download") return;

        let attempts = 0;

        const timer = setInterval(() => {
            attempts++;

            const manifest = getManifest();

            if (manifest && getPages(manifest).length) {
                clearInterval(timer);

                const button = createButton("Download CBZ");
                button.style.position = "fixed";
                button.style.top = "12px";
                button.style.right = "12px";
                button.style.zIndex = "2147483647";

                document.body.appendChild(button);
                downloadComic(button);
            } else if (attempts >= 40) {
                clearInterval(timer);

                console.error(
                    PREFIX,
                    "Manifest was not available after waiting. " +
                    "Open the console and inspect the reader's manifest."
                );
            }
        }, 500);
    }

    function start() {
        setupReader();
        addBookshelfButtons();

        const observer = new MutationObserver(() => {
            addBookshelfButtons();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        console.log(PREFIX, "Loaded.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
