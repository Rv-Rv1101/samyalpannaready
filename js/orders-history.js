import { auth, db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const historyList = document.getElementById('order-history-list');
const noOrdersMsg = document.getElementById('no-orders-msg');

// Show a loading spinner while fetching
function showLoading() {
    const existing = document.getElementById('orders-loading');
    if (existing) return;
    const loader = document.createElement('div');
    loader.id = 'orders-loading';
    loader.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text-muted);font-size:1rem;';
    loader.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:12px;animation:spin 1s linear infinite;display:inline-block;">⏳</div>
        <p>Loading your orders...</p>
    `;
    historyList.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('orders-loading');
    if (loader) loader.remove();
}

// Show a friendly error message in the UI
function showError(message) {
    hideLoading();
    const existing = document.getElementById('orders-error');
    if (existing) existing.remove();
    const errBox = document.createElement('div');
    errBox.id = 'orders-error';
    errBox.style.cssText = 'text-align:center;padding:60px 20px;';
    errBox.innerHTML = `
        <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
        <h3 style="color:var(--text-light);margin-bottom:8px;">Could not load orders</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;max-width:360px;margin:0 auto 20px;">${message}</p>
        <button onclick="location.reload()" style="background:var(--primary);color:white;padding:10px 24px;border-radius:8px;font-weight:700;border:none;cursor:pointer;">
            🔄 Try Again
        </button>
    `;
    historyList.appendChild(errBox);
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }
    showLoading();
    fetchOrderHistory(user.uid);
});

function fetchOrderHistory(userId) {
    // Simple query on userId only — no orderBy needed (avoids composite index requirement).
    // Sorting is done client-side below.
    const q = query(collection(db, "orders"), where("userId", "==", userId));
    
    onSnapshot(q, (snapshot) => {
        hideLoading();

        // Remove any previous error or cards (but keep the no-orders message)
        const existing = historyList.querySelectorAll('.order-card, #orders-error');
        existing.forEach(el => el.remove());

        if (snapshot.empty) {
            noOrdersMsg.classList.remove('hidden');
            return;
        }

        noOrdersMsg.classList.add('hidden');
        
        let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by timestamp descending (newest first) — done client-side
        orders.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card fade-in';
            
            // Safely get the first item image (imageUrl may be absent in older orders)
            const firstImg = order.items?.[0]?.imageUrl || '';
            const imgHtml = firstImg 
                ? `<img src="${firstImg}" class="order-thumb" onerror="this.style.display='none'">` 
                : `<div class="order-thumb" style="background:rgba(255,74,34,0.1);display:flex;align-items:center;justify-content:center;font-size:1.8rem;border-radius:8px;">🍗</div>`;

            const itemString = (order.items || []).map(i => `${i.name} x${i.quantity}`).join(', ');
            
            // Format the date nicely
            const dateStr = order.timestamp?.seconds 
                ? new Date(order.timestamp.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Date unavailable';

            card.innerHTML = `
                <div class="order-top">
                    ${imgHtml}
                    <div class="order-info">
                        <span class="order-id">#${order.orderId || order.id.substring(0, 8).toUpperCase()}</span>
                        <div class="order-date" style="font-size:0.78rem;color:var(--text-muted);margin:3px 0 6px;">${dateStr}</div>
                        <div class="order-items-list">${itemString}</div>
                    </div>
                    <div class="order-pricing">
                        <div class="order-total">₹${order.totalPrice}</div>
                        <span class="status-badge status-${(order.status || 'pending').toLowerCase().replace(/\s+/g, '-')}">${order.status || 'Pending'}</span>
                    </div>
                </div>
                
                <div class="order-footer">
                    <div class="order-progress-track">
                        <!-- Step 1: Placed -->
                        <div class="track-step ${['Pending', 'Preparing', 'On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>Placed</span>
                        </div>
                        
                        <!-- Step 2: Preparing -->
                        <div class="track-step ${['Preparing', 'On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>Preparing</span>
                        </div>
                        
                        <!-- Step 3: On the Way (Delivery only) -->
                        ${order.orderType === 'Delivery' ? `
                        <div class="track-step ${['On the Way', 'Delivered'].includes(order.status) ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>On the Way</span>
                        </div>
                        ` : ''}
                        
                        <!-- Step 4: Final status -->
                        <div class="track-step ${order.status === 'Delivered' || order.status === 'Picked Up' || order.status === 'Served' ? 'active' : ''}">
                            <div class="step-circle"></div>
                            <span>${order.orderType === 'Delivery' ? 'Delivered' : (order.orderType === 'Pickup' ? 'Picked Up' : 'Served')}</span>
                        </div>
                    </div>
                </div>
            `;
            historyList.appendChild(card);
        });
    }, (error) => {
        // Firestore error handler — catches permission denied, index errors, network failures, etc.
        console.error('Firestore onSnapshot error:', error);
        hideLoading();

        let friendlyMsg = 'Something went wrong while fetching your orders. Please try again.';

        if (error.code === 'permission-denied') {
            friendlyMsg = 'You do not have permission to view these orders. Please log in again.';
        } else if (error.code === 'failed-precondition') {
            // Composite index missing — this is a common 500-like error in Firestore
            friendlyMsg = 'A database index is being built. Please wait a moment and try again.';
        } else if (error.code === 'unavailable' || error.code === 'network-request-failed') {
            friendlyMsg = 'No internet connection. Please check your network and try again.';
        }

        showError(friendlyMsg);
    });
}
const logoutBtn = document.getElementById('logout-btn');
const logoutBtnMob = document.getElementById('logout-btn-mob');

const handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    });
};

if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (logoutBtnMob) logoutBtnMob.addEventListener('click', handleLogout);
