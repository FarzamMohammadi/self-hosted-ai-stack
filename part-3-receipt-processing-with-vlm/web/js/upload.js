/**
 * Receipt Manager - Upload Page Module
 * Handles file upload functionality with drag & drop support
 */

(function() {
    'use strict';

    const { API, CONSTANTS, FileValidator, UIHelpers } = window.ReceiptManager;

    // DOM Elements (initialized on DOMContentLoaded)
    let elements = {};

    /**
     * Initialize the upload page
     */
    function init() {
        cacheElements();
        bindEvents();
    }

    /**
     * Cache DOM elements for performance
     */
    function cacheElements() {
        elements = {
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            uploadProgress: document.getElementById('uploadProgress'),
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            uploadResult: document.getElementById('uploadResult'),
            alertContainer: document.getElementById('alertContainer'),
            uploadAnotherBtn: document.getElementById('uploadAnotherBtn'),
            receiptFilename: document.getElementById('receiptFilename')
        };
    }

    /**
     * Bind event listeners
     */
    function bindEvents() {
        const { uploadZone, fileInput, uploadAnotherBtn } = elements;

        // Click to browse
        uploadZone.addEventListener('click', () => fileInput.click());

        // Keyboard support for upload zone
        uploadZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        // File input change
        fileInput.addEventListener('change', handleFileInputChange);

        // Drag and drop events
        uploadZone.addEventListener('dragover', handleDragOver);
        uploadZone.addEventListener('dragleave', handleDragLeave);
        uploadZone.addEventListener('drop', handleDrop);

        // Upload another button
        uploadAnotherBtn.addEventListener('click', resetForm);
    }

    /**
     * Handle file input change event
     */
    function handleFileInputChange(e) {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    }

    /**
     * Handle dragover event
     */
    function handleDragOver(e) {
        e.preventDefault();
        elements.uploadZone.classList.add('dragover');
    }

    /**
     * Handle dragleave event
     */
    function handleDragLeave(e) {
        e.preventDefault();
        elements.uploadZone.classList.remove('dragover');
    }

    /**
     * Handle drop event
     */
    function handleDrop(e) {
        e.preventDefault();
        elements.uploadZone.classList.remove('dragover');

        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    }

    /**
     * Process selected file - validate and upload
     */
    function processFile(file) {
        const validation = FileValidator.validate(file);

        if (!validation.valid) {
            showAlert(validation.error, 'error');
            return;
        }

        uploadFile(file);
    }

    /**
     * Upload file to server
     */
    function uploadFile(file) {
        const { uploadZone, uploadProgress, uploadResult, alertContainer } = elements;

        // Clear previous alerts
        alertContainer.innerHTML = '';

        // Update UI state
        uploadZone.classList.add('hidden');
        uploadResult.classList.add('hidden');
        uploadProgress.classList.remove('hidden');

        // Prepare form data
        const formData = new FormData();
        formData.append('data', file);

        // Create XHR for progress tracking
        const xhr = new XMLHttpRequest();

        // Progress handler
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateProgress(percent);
            }
        });

        // Load handler
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                handleUploadSuccess(xhr.responseText, file.name);
            } else {
                handleUploadError(parseErrorResponse(xhr));
            }
        });

        // Error handlers
        xhr.addEventListener('error', () => {
            handleUploadError('Network error. Please check your connection and try again.');
        });

        xhr.addEventListener('abort', () => {
            handleUploadError('Upload cancelled.');
        });

        xhr.addEventListener('timeout', () => {
            handleUploadError('Upload timed out. The file may be too large or your connection is slow.');
        });

        // Send request
        xhr.timeout = API.UPLOAD_TIMEOUT;
        xhr.open('POST', API.ENDPOINTS.UPLOAD_RECEIPT, true);
        xhr.send(formData);
    }

    /**
     * Parse error response from XHR
     */
    function parseErrorResponse(xhr) {
        let errorMessage = `Upload failed with status ${xhr.status}`;

        try {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage;
        } catch (e) {
            // Use default error message
        }

        return errorMessage;
    }

    /**
     * Update progress bar
     */
    function updateProgress(percent) {
        elements.progressBar.style.width = percent + '%';
        elements.progressBar.parentElement.setAttribute('aria-valuenow', percent);
        elements.progressText.textContent = percent + '%';
    }

    /**
     * Handle successful upload
     */
    function handleUploadSuccess(responseText, filename) {
        let response;

        try {
            response = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON parse error:', e);
            handleUploadError('Invalid response from server. Please try again.');
            return;
        }

        console.log('Upload success:', response);

        // Hide progress, show result
        elements.uploadProgress.classList.add('hidden');
        elements.uploadResult.classList.remove('hidden');

        // Show success alert
        showAlert('Receipt uploaded successfully! Processing will begin shortly.', 'success');

        // Populate result
        elements.receiptFilename.textContent = response.receipt?.filename || filename;

        // Reset file input
        elements.fileInput.value = '';
    }

    /**
     * Handle upload error
     */
    function handleUploadError(errorMessage) {
        console.error('Upload error:', errorMessage);

        // Reset UI state
        elements.uploadProgress.classList.add('hidden');
        elements.uploadZone.classList.remove('hidden');
        updateProgress(0);

        // Show error popup
        UIHelpers.showErrorPopup(errorMessage);

        // Reset file input
        elements.fileInput.value = '';
    }

    /**
     * Show alert message
     */
    function showAlert(message, type) {
        UIHelpers.showAlert(message, type, elements.alertContainer, type === 'success' ? 5000 : 0);
    }

    /**
     * Reset form to initial state
     */
    function resetForm() {
        elements.uploadZone.classList.remove('hidden');
        elements.uploadProgress.classList.add('hidden');
        elements.uploadResult.classList.add('hidden');
        elements.alertContainer.innerHTML = '';
        elements.fileInput.value = '';
        updateProgress(0);
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
