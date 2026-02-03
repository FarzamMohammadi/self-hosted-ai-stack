/**
 * Receipt Manager - Receipts Page Module
 * Handles receipts listing, filtering, sorting, detail view, and export
 */

(function() {
    'use strict';

    const { API, CONSTANTS, Formatters, UIHelpers, DateUtils } = window.ReceiptManager;

    // State
    const state = {
        receipts: [],
        filtered: [],
        sort: { column: 'created_at', direction: 'desc' },
        autoRefreshTimer: null,
        currentReceiptId: null,
        lightbox: {
            scale: 1,
            translateX: 0,
            translateY: 0,
            isDragging: false,
            startX: 0,
            startY: 0
        }
    };

    // DOM Elements (initialized on DOMContentLoaded)
    let elements = {};

    /**
     * Initialize the receipts page
     */
    function init() {
        cacheElements();
        bindEvents();
        loadReceipts();
    }

    /**
     * Cache DOM elements for performance
     */
    function cacheElements() {
        elements = {
            // Filters
            statusFilter: document.getElementById('statusFilter'),
            dateFilter: document.getElementById('dateFilter'),
            searchFilter: document.getElementById('searchFilter'),
            customDateRange: document.getElementById('customDateRange'),
            dateFrom: document.getElementById('dateFrom'),
            dateTo: document.getElementById('dateTo'),

            // Controls
            refreshBtn: document.getElementById('refreshBtn'),
            refreshIcon: document.getElementById('refreshIcon'),
            autoRefreshToggle: document.getElementById('autoRefreshToggle'),
            exportBtn: document.getElementById('exportBtn'),

            // Table
            receiptsTableBody: document.getElementById('receiptsTableBody'),
            receiptsCount: document.getElementById('receiptsCount'),

            // States
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            tableContainer: document.getElementById('tableContainer'),
            alertContainer: document.getElementById('alertContainer'),

            // Modal
            detailModal: document.getElementById('detailModal'),
            closeModal: document.getElementById('closeModal'),
            modalLoading: document.getElementById('modalLoading'),
            modalContent: document.getElementById('modalContent'),
            modalTitle: document.getElementById('modalTitle'),
            receiptImage: document.getElementById('receiptImage'),
            zoomBtn: document.getElementById('zoomBtn'),
            downloadBtn: document.getElementById('downloadBtn'),

            // Lightbox
            lightbox: document.getElementById('imageLightbox'),
            lightboxImage: document.getElementById('lightboxImage'),
            lightboxZoomIn: document.getElementById('lightboxZoomIn'),
            lightboxZoomOut: document.getElementById('lightboxZoomOut'),
            lightboxZoomLevel: document.getElementById('lightboxZoomLevel'),
            lightboxReset: document.getElementById('lightboxReset'),
            lightboxClose: document.getElementById('lightboxClose'),

            // Detail fields
            detailFilename: document.getElementById('detailFilename'),
            detailDate: document.getElementById('detailDate'),
            detailSize: document.getElementById('detailSize'),
            detailStatus: document.getElementById('detailStatus'),
            detailItemsCount: document.getElementById('detailItemsCount'),
            detailConfidence: document.getElementById('detailConfidence'),
            detailCurrency: document.getElementById('detailCurrency'),
            detailReceiptType: document.getElementById('detailReceiptType'),
            detailTaxFormat: document.getElementById('detailTaxFormat'),

            // Items
            noItems: document.getElementById('noItems'),
            itemsTableContainer: document.getElementById('itemsTableContainer'),
            itemsTableBody: document.getElementById('itemsTableBody'),
            receiptSubtotal: document.getElementById('receiptSubtotal'),
            receiptTaxAmount: document.getElementById('receiptTaxAmount'),
            taxPercentage: document.getElementById('taxPercentage'),
            receiptTotal: document.getElementById('receiptTotal')
        };
    }

    /**
     * Bind event listeners
     */
    function bindEvents() {
        // Filters
        elements.statusFilter.addEventListener('change', applyFilters);
        elements.dateFilter.addEventListener('change', handleDateFilterChange);
        elements.searchFilter.addEventListener('input', UIHelpers.debounce(applyFilters, 300));
        elements.dateFrom.addEventListener('change', applyFilters);
        elements.dateTo.addEventListener('change', applyFilters);

        // Controls
        elements.refreshBtn.addEventListener('click', loadReceipts);
        elements.autoRefreshToggle.addEventListener('change', handleAutoRefreshToggle);
        elements.exportBtn.addEventListener('click', handleExport);

        // Modal
        elements.closeModal.addEventListener('click', hideDetailModal);
        elements.detailModal.addEventListener('click', (e) => {
            if (e.target === elements.detailModal) hideDetailModal();
        });
        elements.zoomBtn.addEventListener('click', openLightbox);
        elements.receiptImage.addEventListener('click', openLightbox);

        // Lightbox
        elements.lightboxClose.addEventListener('click', closeLightbox);
        elements.lightboxZoomIn.addEventListener('click', () => zoomLightbox(0.25));
        elements.lightboxZoomOut.addEventListener('click', () => zoomLightbox(-0.25));
        elements.lightboxReset.addEventListener('click', resetLightbox);
        elements.lightbox.addEventListener('wheel', handleLightboxWheel, { passive: false });
        elements.lightbox.addEventListener('mousedown', handleLightboxMouseDown);
        elements.lightbox.addEventListener('mousemove', handleLightboxMouseMove);
        elements.lightbox.addEventListener('mouseup', handleLightboxMouseUp);
        elements.lightbox.addEventListener('mouseleave', handleLightboxMouseUp);
        elements.lightbox.addEventListener('click', (e) => {
            if (e.target === elements.lightbox) closeLightbox();
        });

        // Table sorting
        document.querySelectorAll('.table th.sortable').forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.lightbox.classList.contains('active')) {
                    closeLightbox();
                } else if (elements.detailModal.classList.contains('active')) {
                    hideDetailModal();
                }
            }
        });

        // Auto-refresh cleanup: pause when page is hidden, resume when visible
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', stopAutoRefresh);
    }

    /**
     * Handle page visibility change - pause/resume auto-refresh
     */
    function handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden, pause auto-refresh but remember state
            if (state.autoRefreshTimer) {
                stopAutoRefresh();
                elements.autoRefreshToggle.dataset.wasRunning = 'true';
            }
        } else {
            // Page is visible again, resume if it was running
            if (elements.autoRefreshToggle.dataset.wasRunning === 'true' && elements.autoRefreshToggle.checked) {
                startAutoRefresh();
                delete elements.autoRefreshToggle.dataset.wasRunning;
            }
        }
    }

    // ==================== Data Loading ====================

    /**
     * Load receipts from API
     */
    async function loadReceipts() {
        try {
            // Show loading state on first load
            if (state.receipts.length === 0) {
                elements.loadingState.classList.remove('hidden');
                elements.emptyState.classList.add('hidden');
                elements.tableContainer.classList.add('hidden');
            }

            // Animate refresh icon
            animateRefreshIcon();

            // Fetch receipts
            const response = await fetch(API.ENDPOINTS.GET_RECEIPTS, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(await parseErrorMessage(response));
            }

            // Parse response
            const data = await parseJsonResponse(response);
            state.receipts = Array.isArray(data) ? data : (data.receipts || []);

            // Apply filters and render
            applyFilters();
            elements.loadingState.classList.add('hidden');

        } catch (error) {
            console.error('Error loading receipts:', error);
            handleLoadError(error.message);
        }
    }

    /**
     * Animate the refresh icon
     */
    function animateRefreshIcon() {
        elements.refreshIcon.style.transform = 'rotate(360deg)';
        elements.refreshIcon.style.transition = 'transform 0.5s';
        setTimeout(() => {
            elements.refreshIcon.style.transform = 'rotate(0deg)';
        }, 500);
    }

    /**
     * Handle load error
     */
    function handleLoadError(message) {
        elements.loadingState.classList.add('hidden');
        state.receipts = [];
        state.filtered = [];

        elements.emptyState.classList.remove('hidden');
        elements.tableContainer.classList.add('hidden');

        UIHelpers.showErrorPopup(message || 'Failed to load receipts. Please try again.');
    }

    // ==================== Filtering & Sorting ====================

    /**
     * Apply all filters to receipts
     */
    function applyFilters() {
        let filtered = [...state.receipts];

        // Status filter
        const status = elements.statusFilter.value;
        if (status) {
            filtered = filtered.filter(r => r.processing_status === status);
        }

        // Date filter
        filtered = applyDateFilter(filtered);

        // Search filter
        const search = elements.searchFilter.value.toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(r => r.filename.toLowerCase().includes(search));
        }

        state.filtered = filtered;
        sortReceipts();
        renderReceipts();
    }

    /**
     * Apply date filter
     */
    function applyDateFilter(receipts) {
        const dateRange = elements.dateFilter.value;
        if (!dateRange) return receipts;

        if (dateRange === 'custom') {
            const from = elements.dateFrom.value ? new Date(elements.dateFrom.value) : null;
            const to = elements.dateTo.value ? new Date(elements.dateTo.value + 'T23:59:59') : null;

            if (from) {
                receipts = receipts.filter(r => new Date(r.created_at) >= from);
            }
            if (to) {
                receipts = receipts.filter(r => new Date(r.created_at) <= to);
            }
        } else {
            const range = DateUtils.getDateRange(dateRange);
            if (range.from) {
                receipts = receipts.filter(r => new Date(r.created_at) >= range.from);
            }
        }

        return receipts;
    }

    /**
     * Handle date filter dropdown change
     */
    function handleDateFilterChange() {
        const isCustom = elements.dateFilter.value === 'custom';
        elements.customDateRange.classList.toggle('hidden', !isCustom);
        applyFilters();
    }

    /**
     * Handle column sort
     */
    function handleSort(column) {
        if (state.sort.column === column) {
            state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            state.sort.column = column;
            state.sort.direction = 'desc';
        }

        // Update UI
        document.querySelectorAll('.table th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === column) {
                th.classList.add(state.sort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });

        sortReceipts();
        renderReceipts();
    }

    /**
     * Sort filtered receipts
     */
    function sortReceipts() {
        const { column, direction } = state.sort;
        const multiplier = direction === 'asc' ? 1 : -1;

        state.filtered.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // Handle dates
            if (column === 'created_at') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }

            // Handle numbers
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }

            // Handle strings
            return String(aVal).localeCompare(String(bVal)) * multiplier;
        });
    }

    // ==================== Rendering ====================

    /**
     * Render receipts table
     */
    function renderReceipts() {
        const count = state.filtered.length;
        elements.receiptsCount.textContent = `${count} receipt${count !== 1 ? 's' : ''}`;

        if (count === 0) {
            elements.emptyState.classList.remove('hidden');
            elements.tableContainer.classList.add('hidden');
            return;
        }

        elements.emptyState.classList.add('hidden');
        elements.tableContainer.classList.remove('hidden');

        elements.receiptsTableBody.innerHTML = state.filtered.map(renderReceiptRow).join('');
    }

    /**
     * Render a single receipt row
     */
    function renderReceiptRow(receipt) {
        const thumbnailUrl = getImageUrl(receipt.file_path);
        const formattedDate = new Date(receipt.created_at).toLocaleString();
        const confidence = receipt.total_confidence_score;

        return `
            <tr onclick="window.ReceiptPage.showDetail('${receipt.id}')" style="cursor: pointer;">
                <td class="thumbnail-cell">
                    ${thumbnailUrl
                        ? `<img src="${thumbnailUrl}" class="thumbnail" alt="${escapeHtml(receipt.filename)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'thumbnail-placeholder\\'>&#128196;</div>';">`
                        : '<div class="thumbnail-placeholder">&#128196;</div>'
                    }
                </td>
                <td class="item-name">${escapeHtml(receipt.filename)}</td>
                <td>${formattedDate}</td>
                <td>${renderStatusBadge(receipt.processing_status)}</td>
                <td>${receipt.items_count || 0}</td>
                <td>${confidence != null ? renderConfidenceBadge(confidence) : 'N/A'}</td>
            </tr>
        `;
    }

    /**
     * Render status badge HTML
     */
    function renderStatusBadge(status) {
        return `<span class="status-badge status-${status}">${status}</span>`;
    }

    /**
     * Render confidence badge HTML
     */
    function renderConfidenceBadge(score) {
        const className = UIHelpers.getConfidenceClass(score);
        return `<span class="confidence-badge ${className}">${Formatters.formatConfidence(score)}</span>`;
    }

    // ==================== Receipt Detail Modal ====================

    /**
     * Show receipt detail modal
     */
    async function showReceiptDetail(receiptId) {
        state.currentReceiptId = receiptId;
        elements.detailModal.classList.add('active');
        elements.modalLoading.classList.remove('hidden');
        elements.modalContent.classList.add('hidden');

        try {
            const response = await fetch(`${API.ENDPOINTS.GET_RECEIPT_DETAIL}?receipt_id=${receiptId}`, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(await parseErrorMessage(response));
            }

            const data = await parseJsonResponse(response);
            renderReceiptDetail(data);

            elements.modalLoading.classList.add('hidden');
            elements.modalContent.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading receipt detail:', error);
            elements.modalLoading.classList.add('hidden');
            hideDetailModal();

            UIHelpers.showErrorPopup(error.message || 'Failed to load receipt details. Please try again.');
        }
    }

    /**
     * Render receipt detail in modal
     */
    function renderReceiptDetail(data) {
        const receipt = data.receipt || data;
        const items = data.items || [];
        const imageUrl = getImageUrl(receipt.file_path);
        const currency = receipt.currency || 'USD';

        // Set title
        elements.modalTitle.textContent = receipt.filename;

        // Set image
        if (imageUrl) {
            elements.receiptImage.src = imageUrl;
            elements.receiptImage.alt = receipt.filename;
        }

        // Set download link
        elements.downloadBtn.href = imageUrl;
        elements.downloadBtn.download = receipt.filename;

        // Set metadata
        elements.detailFilename.textContent = receipt.filename;
        elements.detailDate.textContent = Formatters.formatDate(receipt.created_at);
        elements.detailSize.textContent = Formatters.formatBytes(receipt.file_size);
        elements.detailStatus.innerHTML = renderStatusBadge(receipt.processing_status);
        elements.detailItemsCount.textContent = items.length;

        const avgConfidence = receipt.total_confidence_score;
        elements.detailConfidence.innerHTML = avgConfidence != null
            ? renderConfidenceBadge(avgConfidence)
            : 'N/A';

        elements.detailCurrency.textContent = currency;
        elements.detailReceiptType.textContent = CONSTANTS.RECEIPT_TYPE_LABELS[receipt.receipt_type] || receipt.receipt_type || '-';
        elements.detailTaxFormat.textContent = CONSTANTS.TAX_FORMAT_LABELS[receipt.tax_format] || receipt.tax_format || '-';

        // Render items
        if (items.length === 0) {
            elements.noItems.classList.remove('hidden');
            elements.itemsTableContainer.classList.add('hidden');
        } else {
            elements.noItems.classList.add('hidden');
            elements.itemsTableContainer.classList.remove('hidden');
            renderItems(items, receipt);
        }
    }

    /**
     * Render items table
     */
    function renderItems(items, receipt) {
        const currency = receipt?.currency || 'USD';

        // Check if any item has a discount
        const hasDiscounts = items.some(item =>
            (item.item_discount_amount != null && item.item_discount_amount > 0) ||
            (item.item_discount_percentage != null && item.item_discount_percentage > 0)
        );

        elements.itemsTableBody.innerHTML = items.map((item, index) => {
            const unitPrice = parseFloat(item.item_unit_price) || 0;
            const taxPrice = parseFloat(item.item_tax_price) || 0;
            const totalPrice = parseFloat(item.item_total_price) || 0;
            const confidence = parseFloat(item.confidence_score) || 0;
            const quantity = parseFloat(item.item_quantity) || 1;
            const discountAmount = parseFloat(item.item_discount_amount) || 0;
            const discountPct = parseFloat(item.item_discount_percentage) || 0;
            const isVoided = item.item_metadata?.is_voided || false;

            const taxDisplay = taxPrice > 0
                ? Formatters.formatCurrency(taxPrice, currency)
                : (item.item_tax_percentage ? `${item.item_tax_percentage}%` : '-');

            // Format discount display
            let discountDisplay = '-';
            if (discountAmount > 0) {
                discountDisplay = `-${Formatters.formatCurrency(discountAmount, currency)}`;
            } else if (discountPct > 0) {
                discountDisplay = `-${discountPct}%`;
            }

            const rowClass = isVoided ? 'item-voided' : '';
            const namePrefix = isVoided ? '<span class="voided-label">VOID</span> ' : '';

            return `
                <tr class="${rowClass}">
                    <td>${item.item_sequence || (index + 1)}</td>
                    <td class="item-name">${namePrefix}${escapeHtml(item.item_name)}</td>
                    <td>${quantity}</td>
                    <td class="price">${Formatters.formatCurrency(unitPrice, currency)}</td>
                    ${hasDiscounts ? `<td class="price discount">${discountDisplay}</td>` : ''}
                    <td class="price">${taxDisplay}</td>
                    <td class="price">${Formatters.formatCurrency(totalPrice, currency)}</td>
                    <td>${renderConfidenceBadge(confidence)}</td>
                </tr>
            `;
        }).join('');

        // Update table header to include discount column if needed
        const tableHead = elements.itemsTableBody.closest('table').querySelector('thead tr');
        if (hasDiscounts && !tableHead.querySelector('[data-col="discount"]')) {
            const taxHeader = tableHead.querySelector('th:nth-child(5)');
            const discountHeader = document.createElement('th');
            discountHeader.setAttribute('scope', 'col');
            discountHeader.setAttribute('data-col', 'discount');
            discountHeader.textContent = 'Discount';
            taxHeader.parentNode.insertBefore(discountHeader, taxHeader);
        } else if (!hasDiscounts && tableHead.querySelector('[data-col="discount"]')) {
            tableHead.querySelector('[data-col="discount"]').remove();
        }

        // Update footer colspan if discount column present
        const footerRow = elements.itemsTableBody.closest('table').querySelector('tfoot tr.table-subtotal-row td:first-child');
        if (footerRow) {
            footerRow.colSpan = hasDiscounts ? 6 : 5;
        }
        const taxFooterRow = elements.itemsTableBody.closest('table').querySelector('tfoot tr.table-tax-row td:first-child');
        if (taxFooterRow) {
            taxFooterRow.colSpan = hasDiscounts ? 6 : 5;
        }
        const totalFooterRow = elements.itemsTableBody.closest('table').querySelector('tfoot tr.table-total-row td:first-child');
        if (totalFooterRow) {
            totalFooterRow.colSpan = hasDiscounts ? 6 : 5;
        }

        const receiptSubtotal = receipt?.receipt_subtotal;
        const receiptTaxAmount = receipt?.receipt_total_tax_amount;
        const receiptTaxPct = receipt?.receipt_total_tax_percentage;
        const receiptTotal = receipt?.receipt_total;

        // Display subtotal
        elements.receiptSubtotal.textContent = receiptSubtotal != null
            ? Formatters.formatCurrency(receiptSubtotal, currency)
            : '-';

        // Display tax amount and percentage
        elements.receiptTaxAmount.textContent = receiptTaxAmount != null
            ? Formatters.formatCurrency(receiptTaxAmount, currency)
            : '-';
        elements.taxPercentage.textContent = receiptTaxPct != null
            ? `${receiptTaxPct}%`
            : '-';

        // Display total from API (not calculated from items)
        elements.receiptTotal.textContent = receiptTotal != null
            ? Formatters.formatCurrency(receiptTotal, currency)
            : Formatters.formatCurrency(items.reduce((sum, item) => sum + (parseFloat(item.item_total_price) || 0), 0), currency);
    }

    /**
     * Hide detail modal
     */
    function hideDetailModal() {
        elements.detailModal.classList.remove('active');
        state.currentReceiptId = null;
        closeLightbox();
    }

    // ==================== Image Lightbox ====================

    /**
     * Open the lightbox with the current receipt image
     */
    function openLightbox(e) {
        if (e) e.stopPropagation();

        const imageSrc = elements.receiptImage.src;
        if (!imageSrc) return;

        elements.lightboxImage.src = imageSrc;
        elements.lightbox.classList.add('active');
        resetLightbox();
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the lightbox
     */
    function closeLightbox() {
        elements.lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    /**
     * Zoom the lightbox image by delta amount
     */
    function zoomLightbox(delta) {
        const lb = state.lightbox;
        const newScale = Math.max(0.5, Math.min(5, lb.scale + delta));
        lb.scale = newScale;
        updateLightboxTransform();
    }

    /**
     * Reset lightbox to default state
     */
    function resetLightbox() {
        state.lightbox.scale = 1;
        state.lightbox.translateX = 0;
        state.lightbox.translateY = 0;
        updateLightboxTransform();
    }

    /**
     * Update the lightbox image transform
     */
    function updateLightboxTransform() {
        const lb = state.lightbox;
        elements.lightboxImage.style.transform =
            `translate(${lb.translateX}px, ${lb.translateY}px) scale(${lb.scale})`;
        elements.lightboxZoomLevel.textContent = `${Math.round(lb.scale * 100)}%`;
    }

    /**
     * Handle mouse wheel for zooming
     */
    function handleLightboxWheel(e) {
        if (!elements.lightbox.classList.contains('active')) return;
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoomLightbox(delta);
    }

    /**
     * Handle mouse down for panning
     */
    function handleLightboxMouseDown(e) {
        if (e.target === elements.lightboxImage || e.target.closest('.lightbox-content')) {
            state.lightbox.isDragging = true;
            state.lightbox.startX = e.clientX - state.lightbox.translateX;
            state.lightbox.startY = e.clientY - state.lightbox.translateY;
            elements.lightbox.classList.add('dragging');
        }
    }

    /**
     * Handle mouse move for panning
     */
    function handleLightboxMouseMove(e) {
        if (!state.lightbox.isDragging) return;

        state.lightbox.translateX = e.clientX - state.lightbox.startX;
        state.lightbox.translateY = e.clientY - state.lightbox.startY;
        updateLightboxTransform();
    }

    /**
     * Handle mouse up to stop panning
     */
    function handleLightboxMouseUp() {
        state.lightbox.isDragging = false;
        elements.lightbox.classList.remove('dragging');
    }

    // ==================== Auto Refresh ====================

    /**
     * Handle auto-refresh toggle
     */
    function handleAutoRefreshToggle() {
        if (elements.autoRefreshToggle.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    }

    /**
     * Start auto-refresh timer
     */
    function startAutoRefresh() {
        stopAutoRefresh();
        state.autoRefreshTimer = setInterval(loadReceipts, CONSTANTS.AUTO_REFRESH_INTERVAL);
        showAlert('Auto-refresh enabled (every 10 seconds)', 'info');
    }

    /**
     * Stop auto-refresh timer
     */
    function stopAutoRefresh() {
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }
    }

    // ==================== Export ====================

    /**
     * Handle CSV export
     */
    async function handleExport() {
        const btn = elements.exportBtn;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span>&#9203;</span><span>Exporting...</span>';

            // Build query params
            const params = new URLSearchParams();
            if (elements.statusFilter.value) {
                params.append('status', elements.statusFilter.value);
            }

            const response = await fetch(`${API.ENDPOINTS.EXPORT_RECEIPTS}?${params.toString()}`, {
                headers: { 'Accept': 'text/csv' }
            });

            if (!response.ok) {
                throw new Error(await parseErrorMessage(response));
            }

            // Get filename from header or generate default
            const filename = getFilenameFromResponse(response);

            // Download file
            const blob = await response.blob();
            UIHelpers.downloadBlob(blob, filename);

            showAlert('Export completed successfully!', 'success');

        } catch (error) {
            console.error('Export error:', error);
            UIHelpers.showErrorPopup(error.message || 'Failed to export receipts. Please try again.');

        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>&#128229;</span><span>Export CSV</span>';
        }
    }

    /**
     * Extract filename from Content-Disposition header
     */
    function getFilenameFromResponse(response) {
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
            return disposition.split('filename=')[1].replace(/"/g, '');
        }
        return 'receipts_export.csv';
    }

    // ==================== Utilities ====================

    /**
     * Show alert message
     */
    function showAlert(message, type) {
        UIHelpers.showAlert(message, type, elements.alertContainer, (type === 'success' || type === 'info') ? 5000 : 0);
    }

    /**
     * Parse error message from response
     */
    async function parseErrorMessage(response) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage;
        } catch (e) {
            // Use default error message
        }
        return errorMessage;
    }

    /**
     * Parse JSON response with error handling
     */
    async function parseJsonResponse(response) {
        const text = await response.text();
        if (!text || text.trim() === '') {
            return [];
        }
        return JSON.parse(text);
    }

    /**
     * Get image URL from file path
     */
    function getImageUrl(filePath) {
        if (!filePath) return '';
        // Strip /app/uploads/ prefix if present (N8N internal path)
        const cleanPath = filePath.replace(/^\/app\/uploads\//, '');
        return cleanPath ? `/uploads/${cleanPath}` : '';
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        return UIHelpers.escapeHtml(text);
    }

    // Expose showDetail for onclick handlers
    window.ReceiptPage = {
        showDetail: showReceiptDetail
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
