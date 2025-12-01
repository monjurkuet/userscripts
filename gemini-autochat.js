// ==UserScript==
// @name         Text File Processor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Process multiple text files by clicking buttons and filling input fields
// @author       shovon
// @match        *://*.gemini.google.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        buttonSelector: '#app-root > main > side-navigation-v2 > bard-sidenav-container > bard-sidenav > side-navigation-content > div > div > mat-action-list.mat-mdc-action-list.mat-mdc-list-base.mdc-list.top-action-list.ng-star-inserted > side-nav-action-button > button.mat-mdc-list-item.mdc-list-item.mat-ripple.mat-mdc-tooltip-trigger.side-nav-action-button.explicit-gmat-override.mat-mdc-list-item-interactive.mdc-list-item--with-leading-icon.mat-mdc-list-item-single-line.mdc-list-item--with-one-line.ng-star-inserted > span > span > span',

        inputSelectors: [
            'xpath://chat-window/div/input-container/div/input-area-v2/div/div/div[1]/div/div/rich-textarea/div[1]',
            'xpath://rich-textarea//div[@contenteditable="true"]',
            'xpath://div[contains(@class, "ql-editor")]',
            'rich-textarea div.ql-editor',
            '.ql-editor.textarea',
            'div[contenteditable="true"]'
        ],
        submitSelectors: [
            'xpath://button[@aria-label="Send message"]',
            'button[aria-label="Send message"]',
            'button[aria-label*="Send"]',
            '.send-button'
        ],
        waitTime: 2000,
        delayBetweenFiles: 3000,
        humanDelayAfterClick: { min: 300, max: 800 },
        humanDelayBeforeSubmit: { min: 500, max: 1000 },
        maxWaitForElement: 10000,
        // Text input settings
        chunkSize: 50,           // Characters per chunk
        chunkDelay: 20,          // Delay between chunks in ms
        verifyRetries: 3         // Number of retries if text verification fails
    };

    let fileQueue = [];
    let isProcessing = false;
    let logEntries = [];
    let panelVisible = true;

    // ========== XPath Helper Functions ==========

    function getElementByXPath(xpath) {
        try {
            const result = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            return result.singleNodeValue;
        } catch (e) {
            console.error('XPath error:', xpath, e);
            return null;
        }
    }

    function getElement(selector) {
        if (selector.startsWith('xpath:')) {
            const xpath = selector.substring(6);
            return getElementByXPath(xpath);
        } else {
            return document.querySelector(selector);
        }
    }

    // ========== UI Functions ==========

    function createControlPanel() {
        const existingPanel = document.getElementById('fileProcessorPanel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'fileProcessorPanel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ffffff;
            border: 3px solid #4CAF50;
            border-radius: 8px;
            padding: 15px;
            z-index: 2147483647;
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
            max-width: 320px;
            min-width: 300px;
            cursor: move;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'background: #4CAF50; color: white; margin: -15px -15px 10px -15px; padding: 10px 15px; border-radius: 5px 5px 0 0; display: flex; justify-content: space-between; align-items: center;';

        const title = document.createElement('h3');
        title.style.cssText = 'margin: 0; font-size: 16px;';
        title.textContent = '📁 File Processor';

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'togglePanel';
        toggleBtn.style.cssText = 'background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0;';
        toggleBtn.textContent = '−';

        header.appendChild(title);
        header.appendChild(toggleBtn);

        const content = document.createElement('div');
        content.id = 'panelContent';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'fileInput';
        fileInput.multiple = true;
        fileInput.accept = '.txt';
        fileInput.style.cssText = 'margin-bottom: 10px; width: 100%; font-size: 12px; padding: 5px; border: 1px solid #ddd; border-radius: 4px;';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-bottom: 10px;';

        const startBtn = document.createElement('button');
        startBtn.id = 'startProcessing';
        startBtn.style.cssText = 'padding: 8px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; font-weight: bold;';
        startBtn.textContent = '▶ Start';

        const stopBtn = document.createElement('button');
        stopBtn.id = 'stopProcessing';
        stopBtn.style.cssText = 'padding: 8px 15px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; font-weight: bold;';
        stopBtn.textContent = '⏹ Stop';

        const testBtn = document.createElement('button');
        testBtn.id = 'testSelectors';
        testBtn.style.cssText = 'padding: 8px 15px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;';
        testBtn.textContent = '🔍 Test';

        btnContainer.appendChild(startBtn);
        btnContainer.appendChild(stopBtn);
        btnContainer.appendChild(testBtn);

        const statusDiv = document.createElement('div');
        statusDiv.id = 'status';
        statusDiv.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 10px; word-wrap: break-word; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;';
        statusDiv.textContent = 'Ready. Select text files to begin.';

        const progressDiv = document.createElement('div');
        progressDiv.id = 'progress';
        progressDiv.style.cssText = 'margin-top: 10px; font-size: 12px; font-weight: bold; color: #4CAF50;';
        progressDiv.textContent = 'Files: 0 / 0';

        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'downloadLog';
        downloadBtn.style.cssText = 'margin-top: 10px; padding: 8px 15px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 12px; font-weight: bold;';
        downloadBtn.textContent = '💾 Download Log';

        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top: 10px; font-size: 10px; color: #999; text-align: center;';
        footer.textContent = 'Ctrl+Shift+F to toggle | Drag to move';

        content.appendChild(fileInput);
        content.appendChild(btnContainer);
        content.appendChild(statusDiv);
        content.appendChild(progressDiv);
        content.appendChild(downloadBtn);

        panel.appendChild(header);
        panel.appendChild(content);
        panel.appendChild(footer);

        document.body.appendChild(panel);
        console.log('File Processor Panel created successfully');

        makeDraggable(panel);

        fileInput.addEventListener('change', handleFileSelection);
        startBtn.addEventListener('click', startProcessing);
        stopBtn.addEventListener('click', stopProcessing);
        testBtn.addEventListener('click', testSelectors);
        downloadBtn.addEventListener('click', downloadLog);
        toggleBtn.addEventListener('click', togglePanelContent);

        addLogEntry('INFO', 'Script initialized', 'Control panel created');
    }

    function testSelectors() {
        updateStatus('Testing selectors...');
        let results = [];

        const button = document.querySelector(CONFIG.buttonSelector);
        results.push(`New Chat Button: ${button ? '✅ Found' : '❌ Not found'}`);

        let inputFound = false;
        for (const selector of CONFIG.inputSelectors) {
            const element = getElement(selector);
            if (element) {
                results.push(`Input: ✅ Found`);
                console.log('Input element found with:', selector, element);
                inputFound = true;
                break;
            }
        }
        if (!inputFound) {
            results.push('Input: ❌ Not found');
        }

        let submitFound = false;
        for (const selector of CONFIG.submitSelectors) {
            const element = getElement(selector);
            if (element) {
                results.push(`Submit: ✅ Found`);
                console.log('Submit button found with:', selector, element);
                submitFound = true;
                break;
            }
        }
        if (!submitFound) {
            results.push('Submit: ❌ Not found');
        }

        updateStatus(results.join('\n'));
        addLogEntry('INFO', 'Selector test completed', results.join('; '));
    }

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
                return;
            }
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function togglePanelContent() {
        const content = document.getElementById('panelContent');
        const button = document.getElementById('togglePanel');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            button.textContent = '−';
        } else {
            content.style.display = 'none';
            button.textContent = '+';
        }
    }

    function togglePanel() {
        const panel = document.getElementById('fileProcessorPanel');
        if (panel) {
            panelVisible = !panelVisible;
            panel.style.display = panelVisible ? 'block' : 'none';
        }
    }

    function handleFileSelection(e) {
        const files = Array.from(e.target.files);
        fileQueue = [];
        files.forEach(file => {
            if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                fileQueue.push(file);
            }
        });
        updateStatus(`${fileQueue.length} text file(s) loaded`);
        updateProgress(0, fileQueue.length);
    }

    async function startProcessing() {
        if (fileQueue.length === 0) {
            updateStatus('No files to process. Please select text files.');
            return;
        }

        if (isProcessing) {
            updateStatus('Already processing...');
            return;
        }

        isProcessing = true;
        logEntries = [];
        addLogEntry('INFO', 'Processing started', `Total files: ${fileQueue.length}`);
        updateStatus('Processing started...');

        let processed = 0;
        for (let i = 0; i < fileQueue.length; i++) {
            if (!isProcessing) {
                addLogEntry('WARNING', 'Processing stopped by user', `Processed ${processed}/${fileQueue.length} files`);
                updateStatus('Processing stopped by user');
                break;
            }

            const file = fileQueue[i];
            updateStatus(`Processing file ${i + 1}/${fileQueue.length}: ${file.name}`);
            addLogEntry('INFO', `Starting file ${i + 1}/${fileQueue.length}`, file.name);

            try {
                await processFile(file, i + 1);
                processed++;
                addLogEntry('SUCCESS', `Completed file ${i + 1}`, file.name);
                updateProgress(processed, fileQueue.length);

                if (i < fileQueue.length - 1) {
                    await sleep(CONFIG.delayBetweenFiles);
                }
            } catch (error) {
                addLogEntry('ERROR', `Failed to process file ${i + 1}`, `${file.name} - ${error.message}`);
                updateStatus(`Error processing ${file.name}: ${error.message}`);
                console.error('Processing error:', error);
            }
        }

        if (isProcessing) {
            addLogEntry('INFO', 'Processing completed', `Successfully processed ${processed}/${fileQueue.length} files`);
            updateStatus(`Completed! Processed ${processed}/${fileQueue.length} files.`);
        }
        isProcessing = false;
    }

    function stopProcessing() {
        isProcessing = false;
        updateStatus('Stopping after current file...');
    }

    async function processFile(file, fileNumber) {
        try {
            // Step 1: Read file content
            addLogEntry('INFO', `Step 1: Reading file`, file.name);
            const content = await readFileContent(file);
            console.log('File content read:', content.substring(0, 50) + '...');
            addLogEntry('SUCCESS', `Step 1: File read successfully`, `${file.name} (${content.length} characters)`);

            // Step 2: Click the "New Chat" button
            addLogEntry('INFO', `Step 2: Clicking New Chat button`, '');
            const button = document.querySelector(CONFIG.buttonSelector);
            if (!button) {
                throw new Error(`New Chat button not found`);
            }
            button.click();
            console.log('New Chat button clicked');
            addLogEntry('SUCCESS', `Step 2: New Chat button clicked`, '');

            const delayAfterClick = Math.floor(Math.random() * (CONFIG.humanDelayAfterClick.max - CONFIG.humanDelayAfterClick.min + 1)) + CONFIG.humanDelayAfterClick.min;
            await sleep(delayAfterClick*10);

            // Step 3: Wait for chat to load
            addLogEntry('INFO', `Step 3: Waiting ${CONFIG.waitTime}ms for chat to load`, '');
            await sleep(CONFIG.waitTime*10);
            addLogEntry('SUCCESS', `Step 3: Chat loaded`, '');

            // Step 4: Find the input field
            addLogEntry('INFO', `Step 4: Finding input field`, 'Trying multiple selectors');
            const input = await waitForElement(CONFIG.inputSelectors);
            if (!input) {
                throw new Error(`Input field not found after ${CONFIG.maxWaitForElement}ms`);
            }
            console.log('Input found:', input);
            addLogEntry('SUCCESS', `Step 4: Input field found`, input.className || input.tagName);

            // Step 5: Set text in input using chunked approach
            addLogEntry('INFO', `Step 5: Setting text in input`, `${content.length} characters`);
            const textSet = await insertTextChunked(input, content);
            if (!textSet) {
                throw new Error('Failed to set text in input field');
            }
            console.log('Text set in input, length:', input.textContent.length);
            addLogEntry('SUCCESS', `Step 5: Text set successfully`, `${input.textContent.length} chars inserted`);

            const delayBeforeSubmit = Math.floor(Math.random() * (CONFIG.humanDelayBeforeSubmit.max - CONFIG.humanDelayBeforeSubmit.min + 1)) + CONFIG.humanDelayBeforeSubmit.min;
            await sleep(delayBeforeSubmit*10);

            // Step 6: Find and click submit button
            addLogEntry('INFO', `Step 6: Finding submit button`, 'Trying multiple selectors');

            // Wait for submit button to become enabled
            await sleep(700);

            const submitButton = await waitForElement(CONFIG.submitSelectors, 5000);
            if (!submitButton) {
                throw new Error(`Submit button not found after 5000ms`);
            }
            console.log('Submit button found:', submitButton);

            // Make sure button is enabled
            await waitForButtonEnabled(submitButton);

            submitButton.click();
            console.log('Submit button clicked');
            addLogEntry('SUCCESS', `Step 6: Submit button clicked - message sent`, '');
            await sleep(25000);
        } catch (error) {
            console.error('Process file error:', error);
            throw error;
        }
    }

    // Wait for button to be enabled
    async function waitForButtonEnabled(button, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                return true;
            }
            await sleep(100);
        }
        console.log('Button may still be disabled, attempting click anyway');
        return false;
    }

    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForElement(selectors, timeout = CONFIG.maxWaitForElement) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            for (const selector of selectors) {
                const element = getElement(selector);
                if (element) {
                    console.log(`Element found with selector: ${selector}`);
                    return element;
                }
            }
            await sleep(200);
        }

        console.log('Failed to find element. Tried selectors:', selectors);
        return null;
    }

    // ========== CHUNKED TEXT INPUT (Main Solution) ==========

    async function insertTextChunked(element, text) {
        console.log(`Inserting ${text.length} characters in chunks of ${CONFIG.chunkSize}`);

        // Focus and clear the element
        element.focus();
        await sleep(100);

        // Clear existing content
        clearElement(element);
        await sleep(50);

        // Split text into chunks
        const chunks = [];
        for (let i = 0; i < text.length; i += CONFIG.chunkSize) {
            chunks.push(text.substring(i, i + CONFIG.chunkSize));
        }

        console.log(`Split into ${chunks.length} chunks`);

        // Insert each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Make sure element is focused
            if (document.activeElement !== element) {
                element.focus();
                moveCaretToEnd(element);
            }

            // Insert chunk using execCommand
            const success = document.execCommand('insertText', false, chunk);

            if (!success) {
                console.log(`execCommand failed at chunk ${i}, trying alternative`);
                // Fallback: append to existing content
                appendTextManually(element, chunk);
            }

            // Small delay between chunks
            if (CONFIG.chunkDelay > 0 && i < chunks.length - 1) {
                await sleep(CONFIG.chunkDelay);
            }

            // Log progress every 10 chunks
            if (i % 10 === 0) {
                console.log(`Inserted chunk ${i + 1}/${chunks.length}`);
            }
        }

        // Final verification
        await sleep(100);
        const insertedLength = element.textContent.length;
        const expectedLength = text.length;

        console.log(`Verification: Inserted ${insertedLength}/${expectedLength} characters`);

        // Trigger events to notify the app
        triggerInputEvents(element);

        // Consider success if we got at least 90% of the text
        if (insertedLength >= expectedLength * 0.9) {
            return true;
        }

        // If chunked approach didn't work well, try alternative
        console.log('Chunked approach incomplete, trying DataTransfer method');
        return await tryDataTransferMethod(element, text);
    }

    function clearElement(element) {
        try {
            // Select all content
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);

            // Delete
            document.execCommand('delete', false, null);
        } catch (e) {
            // Fallback: clear manually
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }
    }

    function moveCaretToEnd(element) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function appendTextManually(element, text) {
        // Create text node and append
        const textNode = document.createTextNode(text);

        // Find the last text node or create structure
        if (element.lastChild && element.lastChild.nodeType === Node.TEXT_NODE) {
            element.lastChild.textContent += text;
        } else if (element.lastChild && element.lastChild.nodeType === Node.ELEMENT_NODE) {
            element.lastChild.appendChild(textNode);
        } else {
            element.appendChild(textNode);
        }

        moveCaretToEnd(element);
    }

    async function tryDataTransferMethod(element, text) {
        try {
            // Clear element
            clearElement(element);
            element.focus();
            await sleep(50);

            // Create DataTransfer with text
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', text);

            // Create paste event
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dataTransfer
            });

            // Dispatch paste event
            element.dispatchEvent(pasteEvent);

            await sleep(200);

            // Check if it worked
            if (element.textContent.length >= text.length * 0.9) {
                triggerInputEvents(element);
                return true;
            }
        } catch (e) {
            console.log('DataTransfer method failed:', e.message);
        }

        // Last resort: try clipboard API
        return await tryClipboardAPI(element, text);
    }

    async function tryClipboardAPI(element, text) {
        try {
            // Write to clipboard
            await navigator.clipboard.writeText(text);

            // Clear and focus
            clearElement(element);
            element.focus();
            await sleep(50);

            // Try to paste using execCommand
            document.execCommand('paste');

            await sleep(200);

            if (element.textContent.length >= text.length * 0.5) {
                triggerInputEvents(element);
                return true;
            }
        } catch (e) {
            console.log('Clipboard API method failed:', e.message);
        }

        // Final fallback: character by character (slow but reliable)
        return await typeCharacterByCharacter(element, text);
    }

    async function typeCharacterByCharacter(element, text) {
        console.log('Using character-by-character input (this may take a while)');

        clearElement(element);
        element.focus();
        await sleep(50);

        // Type in larger chunks character by character
        const batchSize = 10; // Characters per batch

        for (let i = 0; i < text.length; i += batchSize) {
            const batch = text.substring(i, Math.min(i + batchSize, text.length));

            for (const char of batch) {
                document.execCommand('insertText', false, char);
            }

            // Allow UI to update every batch
            if (i % 100 === 0) {
                await sleep(1);
                console.log(`Typed ${i}/${text.length} characters`);
            }
        }

        await sleep(100);
        triggerInputEvents(element);

        return element.textContent.length > 0;
    }

    function triggerInputEvents(element) {
        const events = ['input', 'change', 'keyup', 'keydown'];
        events.forEach(eventType => {
            element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        });

        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: false,
            inputType: 'insertText'
        }));
    }

    // ========== Utility Functions ==========

    function updateStatus(message) {
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.textContent = message;
        }
    }

    function updateProgress(current, total) {
        const progressDiv = document.getElementById('progress');
        if (progressDiv) {
            progressDiv.textContent = `Files: ${current} / ${total}`;
        }
    }

    function addLogEntry(level, action, details) {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, level, action, details };
        logEntries.push(entry);
        console.log(`[${level}] ${action}: ${details}`);
    }

    function downloadLog() {
        if (logEntries.length === 0) {
            alert('No log entries to download. Process some files first.');
            return;
        }

        let logContent = '=== Text File Processor Log ===\n';
        logContent += `Generated: ${new Date().toISOString()}\n`;
        logContent += `Total Entries: ${logEntries.length}\n`;
        logContent += '='.repeat(50) + '\n\n';

        logEntries.forEach((entry, index) => {
            logContent += `[${index + 1}] ${entry.timestamp}\n`;
            logContent += `Level: ${entry.level}\n`;
            logContent += `Action: ${entry.action}\n`;
            logContent += `Details: ${entry.details}\n`;
            logContent += '-'.repeat(50) + '\n';
        });

        const successCount = logEntries.filter(e => e.level === 'SUCCESS' && e.action.includes('Completed file')).length;
        const errorCount = logEntries.filter(e => e.level === 'ERROR').length;

        logContent += '\n' + '='.repeat(50) + '\n';
        logContent += '=== SUMMARY ===\n';
        logContent += `Successfully Processed: ${successCount} files\n`;
        logContent += `Failed: ${errorCount} files\n`;

        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `file-processor-log-${new Date().toISOString().replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus('Log file downloaded!');
    }

    function init() {
        console.log('Text File Processor: Initializing...');

        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                togglePanel();
            }
        });

        setTimeout(() => {
            try {
                createControlPanel();
                console.log('Text File Processor: Ready!');
            } catch (error) {
                console.error('Text File Processor: Error creating panel:', error);
                setTimeout(createControlPanel, 2000);
            }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();