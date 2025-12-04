// ==UserScript==
// @name         Auto Click YouTube Transcript and Save as JSON
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatically clicks the transcript button on YouTube videos and saves transcript as JSON
// @author       You
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Function to extract video ID from URL
    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    // Function to convert timestamp to seconds
    function timestampToSeconds(timestamp) {
        const parts = timestamp.split(':').map(part => parseInt(part));
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }

    // Function to download JSON file
    function downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Function to extract transcript
    function extractTranscript() {
        const segments = document.querySelectorAll('ytd-transcript-segment-renderer');

        if (segments.length === 0) {
            console.log('No transcript segments found');
            return null;
        }

        const videoId = getVideoId();
        if (!videoId) {
            console.log('Could not extract video ID');
            return null;
        }

        const transcriptData = {
            videoId: videoId,
            videoUrl: window.location.href,
            extractedAt: new Date().toISOString(),
            segments: []
        };

        segments.forEach((segment) => {
            const timestampElement = segment.querySelector('.segment-timestamp');
            const textElement = segment.querySelector('.segment-text');

            if (timestampElement && textElement) {
                const timestamp = timestampElement.textContent.trim();
                const text = textElement.textContent.trim();

                transcriptData.segments.push({
                    timestamp: timestamp,
                    timestampSeconds: timestampToSeconds(timestamp),
                    text: text
                });
            }
        });

        console.log(`Extracted ${transcriptData.segments.length} transcript segments`);
        return transcriptData;
    }

    // Function to wait for transcript to load
    function waitForTranscript(callback, maxAttempts = 50) {
        let attempts = 0;

        const checkInterval = setInterval(() => {
            attempts++;

            // Check if transcript segments are loaded
            const segments = document.querySelectorAll('ytd-transcript-segment-renderer');

            if (segments.length > 0) {
                clearInterval(checkInterval);
                console.log('Transcript loaded successfully');
                callback();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.log('Timeout waiting for transcript to load');
            }
        }, 200);
    }

    // Function to click the transcript button
    function clickTranscriptButton() {
        // Try to find the button using common selectors
        const selectors = [
            'button[aria-label*="transcript" i]',
            'button[aria-label*="Show transcript"]',
            '[target-id="engagement-panel-searchable-transcript"]',
            'ytd-menu-service-item-renderer:has(yt-formatted-string:contains("Show transcript"))',
            'button[aria-label="Show transcript"]',
            'ytd-button-renderer button[aria-label*="Transcript"]'
        ];

        for (const selector of selectors) {
            try {
                const button = document.querySelector(selector);
                if (button) {
                    button.click();
                    console.log('Transcript button clicked!');

                    // Wait for transcript to load then extract and save
                    waitForTranscript(() => {
                        const transcriptData = extractTranscript();
                        if (transcriptData) {
                            const filename = `${transcriptData.videoId}.json`;
                            downloadJSON(transcriptData, filename);
                            console.log(`Transcript saved as ${filename}`);
                        }
                    });

                    return true;
                }
            } catch (e) {
                // Some selectors might not be valid, continue to next
                continue;
            }
        }

        // Also check buttons by text content
        const buttons = document.querySelectorAll('button, ytd-button-renderer button');
        for (const button of buttons) {
            if (button.textContent && button.textContent.toLowerCase().includes('transcript')) {
                button.click();
                console.log('Transcript button clicked by text content!');

                // Wait for transcript to load then extract and save
                waitForTranscript(() => {
                    const transcriptData = extractTranscript();
                    if (transcriptData) {
                        const filename = `${transcriptData.videoId}.json`;
                        downloadJSON(transcriptData, filename);
                        console.log(`Transcript saved as ${filename}`);
                    }
                });

                return true;
            }
        }

        console.log('Transcript button not found');
        return false;
    }

    // Wait for YouTube to fully load the video page
    function waitForVideoPage() {
        // Check if we're on a video page
        if (!window.location.pathname.includes('/watch')) {
            return;
        }

        // Try clicking immediately
        if (clickTranscriptButton()) {
            return;
        }

        // Set up a mutation observer to wait for the button to appear
        const observer = new MutationObserver((mutations, obs) => {
            if (clickTranscriptButton()) {
                obs.disconnect();
            }
        });

        // Start observing the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop observing after 30 seconds to prevent memory leaks
        setTimeout(() => {
            observer.disconnect();
        }, 30000);
    }

    // Handle navigation in single-page application
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.includes('/watch')) {
                // Wait a bit for the page to load
                setTimeout(waitForVideoPage, 1000);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    // Initial run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForVideoPage);
    } else {
        waitForVideoPage();
    }

})();