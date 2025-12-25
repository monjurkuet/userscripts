// ==UserScript==
// @name         YouTube Transcript Downloader - Manual Button
// @version      3.0
// @description  Adds a "Save JSON" button to the transcript header once you open it.
// @author       monjurkuet
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- CONSTANTS ---
    const BUTTON_ID = 'save-transcript-json-btn';
    const PANEL_SELECTOR = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';

    let observer = null;
    let debounceTimer = null;
    let currentVideoId = null;

    // --- UTILITY FUNCTIONS ---

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    function getVideoTitle() {
        const selectors = [
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-video-primary-info-renderer yt-formatted-string',
            '#title h1 yt-formatted-string',
            'ytd-watch-metadata h1'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el?.textContent?.trim()) {
                return el.textContent.trim();
            }
        }
        return 'untitled';
    }

    function sanitizeFilename(name) {
        return name
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    function timestampToSeconds(timestamp) {
        const parts = timestamp.split(':').map(Number);
        switch (parts.length) {
            case 2: return parts[0] * 60 + parts[1];
            case 3: return parts[0] * 3600 + parts[1] * 60 + parts[2];
            default: return 0;
        }
    }

    function debounce(func, wait) {
        return function executedFunction(...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // --- DOWNLOAD FUNCTION ---

    function downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Delay revocation to ensure download completes
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // --- TRANSCRIPT EXTRACTION ---

    function extractTranscript() {
        const segmentSelectors = [
            'ytd-transcript-segment-renderer',
            'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'
        ];

        let segments = [];
        for (const selector of segmentSelectors) {
            segments = document.querySelectorAll(selector);
            if (segments.length > 0) break;
        }

        if (segments.length === 0) return null;

        const transcriptSegments = [];

        segments.forEach((segment) => {
            const timestampElement = segment.querySelector(
                '.segment-timestamp, [class*="timestamp"]'
            );
            const textElement = segment.querySelector(
                '.segment-text, #segment-text, yt-formatted-string.segment-text, [class*="segment-text"]'
            );

            if (timestampElement && textElement) {
                const timestamp = timestampElement.textContent.trim();
                const text = textElement.textContent.trim();

                if (text) {
                    transcriptSegments.push({
                        timestamp,
                        timestampSeconds: timestampToSeconds(timestamp),
                        text
                    });
                }
            }
        });

        return transcriptSegments;
    }

    // --- BUTTON HANDLER ---

    function handleManualDownload(button) {
        const videoId = getVideoId();
        const videoTitle = getVideoTitle();

        if (!videoId) {
            alert('Could not determine video ID.');
            return;
        }

        // Show loading state
        const originalText = button.textContent;
        const originalBg = button.style.backgroundColor;
        button.textContent = '⏳ Extracting...';
        button.style.backgroundColor = '#666';
        button.disabled = true;

        // Allow UI to update
        requestAnimationFrame(() => {
            setTimeout(() => {
                try {
                    const segments = extractTranscript();

                    if (!segments || segments.length === 0) {
                        alert('No transcript segments found.\n\nPlease ensure:\n1. The transcript panel is open\n2. Segments have loaded (scroll down if needed)');
                        resetButton();
                        return;
                    }

                    const transcriptData = {
                        videoId,
                        videoTitle,
                        videoUrl: window.location.href,
                        extractedAt: new Date().toISOString(),
                        totalSegments: segments.length,
                        totalDuration: segments[segments.length - 1]?.timestamp || 'N/A',
                        segments
                    };

                    const filename = `${sanitizeFilename(videoTitle)}_${videoId}.json`;
                    downloadJSON(transcriptData, filename);

                    // Success feedback
                    button.textContent = '✓ Downloaded!';
                    button.style.backgroundColor = '#2e7d32';

                    setTimeout(resetButton, 2000);

                } catch (error) {
                    console.error('[Transcript Downloader] Error:', error);
                    alert('An error occurred while extracting the transcript.');
                    resetButton();
                }

                function resetButton() {
                    button.textContent = originalText;
                    button.style.backgroundColor = originalBg;
                    button.disabled = false;
                }
            }, 50);
        });
    }

    // --- BUTTON CREATION ---

    function createButton() {
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.textContent = '💾 Save JSON';
        btn.title = 'Download transcript as JSON file';

        Object.assign(btn.style, {
            backgroundColor: '#c00',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '18px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            fontFamily: 'Roboto, Arial, sans-serif',
            marginLeft: '12px',
            transition: 'all 0.2s ease',
            flexShrink: '0',
            outline: 'none'
        });

        // Hover effects
        btn.addEventListener('mouseenter', () => {
            if (!btn.disabled) btn.style.backgroundColor = '#a00';
        });

        btn.addEventListener('mouseleave', () => {
            if (!btn.disabled) btn.style.backgroundColor = '#c00';
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!btn.disabled) handleManualDownload(btn);
        });

        return btn;
    }

    // --- BUTTON INJECTION ---

    function injectButton() {
        // Only on watch pages
        if (!window.location.pathname.includes('/watch')) return;

        // Skip if already exists
        if (document.getElementById(BUTTON_ID)) return;

        const panel = document.querySelector(PANEL_SELECTOR);
        if (!panel) return;

        // Check if panel is visible
        if (panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') return;

        // Try multiple header locations
        const headerSelectors = [
            '#header #title-container',
            '#header ytd-engagement-panel-title-header-renderer',
            '#header #title-text',
            '#header'
        ];

        for (const selector of headerSelectors) {
            const container = panel.querySelector(selector);
            if (container) {
                // Make container flex if needed
                const style = window.getComputedStyle(container);
                if (style.display !== 'flex') {
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                }

                container.appendChild(createButton());
                console.log('[Transcript Downloader] Button injected');
                return;
            }
        }
    }

    function removeButton() {
        document.getElementById(BUTTON_ID)?.remove();
    }

    // --- OBSERVER SETUP ---

    function setupObserver() {
        if (observer) observer.disconnect();

        const debouncedHandler = debounce(() => {
            const newVideoId = getVideoId();

            // Handle video change
            if (newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                removeButton();
            }

            injectButton();
        }, 300);

        observer = new MutationObserver(debouncedHandler);

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['visibility', 'hidden']
        });
    }

    // --- INITIALIZATION ---

    function init() {
        currentVideoId = getVideoId();
        setupObserver();

        // Initial injection attempt
        setTimeout(injectButton, 1000);

        // Handle SPA navigation
        window.addEventListener('yt-navigate-finish', () => {
            currentVideoId = getVideoId();
            removeButton();
            setTimeout(injectButton, 500);
        });

        // Handle popstate for back/forward navigation
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                currentVideoId = getVideoId();
                removeButton();
                setTimeout(injectButton, 500);
            }, 100);
        });

        console.log('[Transcript Downloader] Initialized v3.0');
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();