(function() {
    'use strict';
    
    const MAINTENANCE_CONFIG = {
        enabled: false,  // Set to false to disable the popup
        dismissible: true,  // Allow users to dismiss the popup
        storageKey: 'maintenance-dismissed-nov-9-2025',  // Change this for each new maintenance notice
        showOnce: true  // Only show once per browser session if dismissed
    };
    
    console.log('Maintenance script loaded');
    
    function shouldShowMaintenance() {
        if (!MAINTENANCE_CONFIG.enabled) {
            console.log('Maintenance disabled');
            return false;
        }
        
        if (MAINTENANCE_CONFIG.showOnce && MAINTENANCE_CONFIG.dismissible) {
            const dismissed = localStorage.getItem(MAINTENANCE_CONFIG.storageKey);
            if (dismissed === 'true') {
                console.log('Maintenance already dismissed');
                return false;
            }
        }
        
        return true;
    }
    
    function showMaintenancePopup() {
        const popup = document.getElementById('maintenance-popup');
        if (popup) {
            console.log('Showing maintenance popup');
            popup.classList.add('show');
            document.body.style.overflow = 'hidden';
        } else {
            console.error('Maintenance popup element not found!');
        }
    }
    
    function hideMaintenancePopup() {
        const popup = document.getElementById('maintenance-popup');
        if (popup) {
            popup.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    function dismissMaintenance() {
        console.log('Dismissing maintenance popup');
        if (MAINTENANCE_CONFIG.dismissible && MAINTENANCE_CONFIG.showOnce) {
            localStorage.setItem(MAINTENANCE_CONFIG.storageKey, 'true');
        }
        hideMaintenancePopup();
    }

    function initMaintenancePopup() {
        console.log('Initializing maintenance popup');
        
        if (!shouldShowMaintenance()) {
            console.log('Not showing maintenance popup');
            return;
        }
        
        setTimeout(showMaintenancePopup, 100);
        
        const closeBtn = document.getElementById('maintenance-close-btn');
        const dismissBtn = document.getElementById('maintenance-dismiss-btn');
        const popup = document.getElementById('maintenance-popup');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', dismissMaintenance);
        }
        
        if (dismissBtn) {
            dismissBtn.addEventListener('click', dismissMaintenance);
        }
        
        if (popup) {
            popup.addEventListener('click', function(e) {
                if (e.target === popup) {
                    dismissMaintenance();
                }
            });
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && popup && popup.classList.contains('show')) {
                dismissMaintenance();
            }
        });
    }
    
    initMaintenancePopup();
})();