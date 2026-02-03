/**
 * Receipt Manager - Shared JavaScript Module
 * Common utilities and API client functions
 */

// API Configuration
const API = {
    BASE_URL: '',  // Same origin (relative to current domain)
    ENDPOINTS: {
        UPLOAD_RECEIPT: '/webhook/upload-receipt',
        GET_RECEIPTS: '/webhook/get-receipts',
        GET_RECEIPT_DETAIL: '/webhook/get-receipt-detail',
        EXPORT_RECEIPTS: '/webhook/export-receipts'
    },
    TIMEOUT: 30000, // 30 seconds
    UPLOAD_TIMEOUT: 60000, // 60 seconds for uploads
};

// Constants
const CONSTANTS = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.pdf'],
    AUTO_REFRESH_INTERVAL: 10000, // 10 seconds
    STATUSES: {
        PENDING: 'pending',
        PROCESSING: 'processing',
        COMPLETED: 'completed',
        FAILED: 'failed'
    },
    CONFIDENCE_THRESHOLDS: {
        HIGH: 0.9,
        MEDIUM: 0.7
    },
    RECEIPT_TYPES: {
        GROCERY: 'grocery',
        RESTAURANT: 'restaurant',
        RETAIL: 'retail',
        SERVICE: 'service',
        UNKNOWN: 'unknown'
    },
    TAX_FORMATS: {
        ADDED: 'added',
        INCLUSIVE: 'inclusive',
        NONE: 'none'
    },
    // Human-readable labels for receipt types and tax formats
    RECEIPT_TYPE_LABELS: {
        grocery: 'Grocery',
        restaurant: 'Restaurant',
        retail: 'Retail',
        service: 'Service',
        unknown: 'Unknown'
    },
    TAX_FORMAT_LABELS: {
        added: 'Tax Added (US)',
        inclusive: 'Tax Inclusive (EU)',
        none: 'No Tax'
    }
};

/**
 * API Client Functions
 */
const ApiClient = {
    /**
     * Upload a receipt file
     * @param {File} file - The file to upload
     * @param {Function} onProgress - Progress callback (optional)
     * @returns {Promise<Object>} Upload response
     */
    async uploadReceipt(file, onProgress = null) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();

            // Progress tracking
            if (onProgress && typeof onProgress === 'function') {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = Math.round((e.loaded / e.total) * 100);
                        onProgress(percentComplete);
                    }
                });
            }

            // Success
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        reject(new Error('Invalid JSON response from server'));
                    }
                } else {
                    let errorMessage = `Upload failed with status ${xhr.status}`;
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        errorMessage = errorData.message || errorData.error || errorMessage;
                    } catch (e) {
                        // Use default error message
                    }
                    reject(new Error(errorMessage));
                }
            });

            // Error
            xhr.addEventListener('error', () => {
                reject(new Error('Network error. Please check your connection.'));
            });

            // Abort
            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled.'));
            });

            // Timeout
            xhr.timeout = API.TIMEOUT;
            xhr.addEventListener('timeout', () => {
                reject(new Error('Upload timed out. Please try again.'));
            });

            // Send request
            xhr.open('POST', API.ENDPOINTS.UPLOAD_RECEIPT, true);
            xhr.send(formData);
        });
    },

    /**
     * Get list of receipts with optional filters
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of receipts
     */
    async getReceipts(filters = {}) {
        try {
            const params = new URLSearchParams();

            if (filters.status) {
                params.append('status', filters.status);
            }

            if (filters.date_from) {
                params.append('date_from', filters.date_from);
            }

            if (filters.date_to) {
                params.append('date_to', filters.date_to);
            }

            const url = `${API.ENDPOINTS.GET_RECEIPTS}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return Array.isArray(data) ? data : (data.receipts || []);

        } catch (error) {
            console.error('Error fetching receipts:', error);
            throw error;
        }
    },

    /**
     * Get detailed information about a specific receipt
     * @param {string} receiptId - The receipt ID
     * @returns {Promise<Object>} Receipt details with items
     */
    async getReceiptDetail(receiptId) {
        try {
            const url = `${API.ENDPOINTS.GET_RECEIPT_DETAIL}?receipt_id=${receiptId}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error('Error fetching receipt detail:', error);
            throw error;
        }
    },

    /**
     * Export receipts to CSV
     * @param {Object} filters - Filter options
     * @returns {Promise<Blob>} CSV file blob
     */
    async exportReceipts(filters = {}) {
        try {
            const params = new URLSearchParams();

            if (filters.status) {
                params.append('status', filters.status);
            }

            if (filters.date_from) {
                params.append('date_from', filters.date_from);
            }

            if (filters.date_to) {
                params.append('date_to', filters.date_to);
            }

            const url = `${API.ENDPOINTS.EXPORT_RECEIPTS}?${params.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/csv'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return {
                blob: await response.blob(),
                filename: this._getFilenameFromResponse(response)
            };

        } catch (error) {
            console.error('Error exporting receipts:', error);
            throw error;
        }
    },

    /**
     * Extract filename from Content-Disposition header
     * @private
     */
    _getFilenameFromResponse(response) {
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
            return disposition.split('filename=')[1].replace(/"/g, '');
        }

        // Generate default filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        return `receipts_export_${timestamp}.csv`;
    }
};

/**
 * File Validation Utilities
 */
const FileValidator = {
    /**
     * Validate file before upload
     * @param {File} file - File to validate
     * @returns {Object} Validation result {valid: boolean, error?: string}
     */
    validate(file) {
        if (!file) {
            return { valid: false, error: 'No file selected' };
        }

        // Check file type
        if (!CONSTANTS.ALLOWED_FILE_TYPES.includes(file.type)) {
            return {
                valid: false,
                error: `Invalid file type. Please upload ${CONSTANTS.ALLOWED_EXTENSIONS.join(', ')} files only.`
            };
        }

        // Check file size
        if (file.size > CONSTANTS.MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const maxSizeMB = (CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
            return {
                valid: false,
                error: `File too large (${sizeMB}MB). Maximum size is ${maxSizeMB}MB.`
            };
        }

        // Check for empty file
        if (file.size === 0) {
            return {
                valid: false,
                error: 'File is empty. Please select a valid file.'
            };
        }

        return { valid: true };
    }
};

/**
 * Formatting Utilities
 */
const Formatters = {
    /**
     * Format bytes to human-readable size
     * @param {number} bytes - Bytes to format
     * @returns {string} Formatted size
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Format currency amount
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency code (default: USD)
     * @returns {string} Formatted currency
     */
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    },

    /**
     * Format date to localized string
     * @param {Date|string} date - Date to format
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date
     */
    formatDate(date, options = {}) {
        const dateObj = typeof date === 'string' ? new Date(date) : date;

        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };

        return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(dateObj);
    },

    /**
     * Format relative time (e.g., "2 hours ago")
     * @param {Date|string} date - Date to format
     * @returns {string} Relative time string
     */
    formatRelativeTime(date) {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        const now = new Date();
        const diffMs = now - dateObj;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
        if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;

        return this.formatDate(dateObj);
    },

    /**
     * Format confidence score as percentage
     * @param {number} score - Confidence score (0-1)
     * @returns {string} Formatted percentage
     */
    formatConfidence(score) {
        if (score == null || isNaN(score)) return 'N/A';
        return `${(score * 100).toFixed(0)}%`;
    }
};

/**
 * UI Helper Functions
 */
const UIHelpers = {
    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Show alert message
     * @param {string} message - Alert message
     * @param {string} type - Alert type (success, error, warning, info)
     * @param {HTMLElement} container - Container element
     * @param {number} autoDismiss - Auto-dismiss duration in ms (0 = no auto-dismiss)
     */
    showAlert(message, type = 'info', container, autoDismiss = 5000) {
        if (!container) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;

        container.innerHTML = '';
        container.appendChild(alertDiv);

        if (autoDismiss > 0 && (type === 'success' || type === 'info')) {
            setTimeout(() => {
                alertDiv.remove();
            }, autoDismiss);
        }
    },

    /**
     * Show error popup/toast
     * @param {string} message - Error message
     * @param {number} autoDismiss - Auto-dismiss duration in ms (default: 7000, 0 = manual dismiss only)
     */
    showErrorPopup(message, autoDismiss = 7000) {
        // Remove any existing error popup
        const existingPopup = document.querySelector('.error-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Create popup container
        const popup = document.createElement('div');
        popup.className = 'error-popup';
        popup.setAttribute('role', 'alert');
        popup.setAttribute('aria-live', 'assertive');

        // Create header
        const header = document.createElement('div');
        header.className = 'error-popup-header';

        const title = document.createElement('div');
        title.className = 'error-popup-title';
        title.innerHTML = '<span>⚠</span><span>Error</span>';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'error-popup-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close error notification');
        closeBtn.onclick = () => this._dismissErrorPopup(popup);

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create body
        const body = document.createElement('div');
        body.className = 'error-popup-body';
        body.textContent = message;

        // Assemble popup
        popup.appendChild(header);
        popup.appendChild(body);

        // Add to document
        document.body.appendChild(popup);

        // Auto-dismiss if specified
        if (autoDismiss > 0) {
            setTimeout(() => {
                this._dismissErrorPopup(popup);
            }, autoDismiss);
        }

        return popup;
    },

    /**
     * Dismiss error popup with animation
     * @private
     */
    _dismissErrorPopup(popup) {
        if (!popup || !popup.parentNode) return;

        popup.classList.add('hiding');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 300); // Match animation duration
    },

    /**
     * Create debounced function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Download blob as file
     * @param {Blob} blob - Blob to download
     * @param {string} filename - Filename for download
     */
    downloadBlob(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    /**
     * Get confidence level class
     * @param {number} score - Confidence score (0-1)
     * @returns {string} CSS class name
     */
    getConfidenceClass(score) {
        if (score >= CONSTANTS.CONFIDENCE_THRESHOLDS.HIGH) return 'confidence-high';
        if (score >= CONSTANTS.CONFIDENCE_THRESHOLDS.MEDIUM) return 'confidence-medium';
        return 'confidence-low';
    },

    /**
     * Get status class
     * @param {string} status - Status value
     * @returns {string} CSS class name
     */
    getStatusClass(status) {
        return `status-${status}`;
    },

    /**
     * Create loading spinner element
     * @param {string} size - Size ('sm', 'md', 'lg')
     * @returns {HTMLElement} Loading spinner element
     */
    createLoadingSpinner(size = 'md') {
        const div = document.createElement('div');
        div.className = `loading${size === 'lg' ? ' loading-lg' : ''}`;
        return div;
    }
};

/**
 * Date Utilities
 */
const DateUtils = {
    /**
     * Get date range based on preset
     * @param {string} preset - Preset name ('today', '7days', '30days')
     * @returns {Object} {from: Date, to: Date}
     */
    getDateRange(preset) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (preset) {
            case 'today':
                return {
                    from: today,
                    to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
                };

            case '7days':
                return {
                    from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
                    to: now
                };

            case '30days':
                return {
                    from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
                    to: now
                };

            default:
                return { from: null, to: null };
        }
    },

    /**
     * Convert Date to ISO date string (YYYY-MM-DD)
     * @param {Date} date - Date to convert
     * @returns {string} ISO date string
     */
    toISODateString(date) {
        return date.toISOString().split('T')[0];
    }
};

/**
 * Export all utilities for use in other scripts
 */
if (typeof window !== 'undefined') {
    window.ReceiptManager = {
        API,
        CONSTANTS,
        ApiClient,
        FileValidator,
        Formatters,
        UIHelpers,
        DateUtils
    };
}
