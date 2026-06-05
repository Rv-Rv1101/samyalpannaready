import { auth, db } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    query, 
    where,
    doc,
    getDoc,
    addDoc,
    serverTimestamp,
    getDocs,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

const foodGrid = document.getElementById('food-grid');
const searchInput = document.getElementById('food-search');
const catFilters = document.getElementById('cat-filters');
const cartCountSpan = document.getElementById('cart-count');
const cartCountMobSpan = document.getElementById('cart-count-mob');
const logoutBtn = document.getElementById('logout-btn');
const logoutBtnMob = document.getElementById('logout-btn-mob');

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('food_cart')) || [];
let shopSettings = { schedule: {} };
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Initial Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    }
    updateCartCount();
    checkShopStatus();
});

async function checkShopStatus() {
    const snap = await getDoc(doc(db, "settings", "shop"));
    if (snap.exists()) {
        shopSettings = snap.data();
        renderProducts(allProducts);
    }
}

function isShopOpen() {
    if (!shopSettings || !shopSettings.schedule) return true;
    
    const now = new Date();
    const dayName = DAYS_OF_WEEK[now.getDay()];
    const dayData = shopSettings.schedule[dayName];

    if (!dayData || dayData.isClosed) return false;
    if (!dayData.open || !dayData.close) return false;

    try {
        const [hOpen, mOpen] = dayData.open.split(':').map(Number);
        const [hClose, mClose] = dayData.close.split(':').map(Number);
        
        if (isNaN(hOpen) || isNaN(mOpen) || isNaN(hClose) || isNaN(mClose)) return false;
        
        const openTime = new Date(now);
        openTime.setHours(hOpen, mOpen, 0);
        const closeTime = new Date(now);
        closeTime.setHours(hClose, mClose, 0);

        if (closeTime < openTime) {
            if (now < closeTime) return true;
            return now >= openTime;
        }
        return now >= openTime && now <= closeTime;
    } catch (err) {
        console.error("Error in isShopOpen:", err);
        return false;
    }
}

// Fetch Products from Firestore (Real-time)
const q = query(collection(db, "products"));
onSnapshot(q, (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCategoryFilters(allProducts);
    renderProducts(allProducts);
});

function renderProducts(products) {
    foodGrid.innerHTML = '';

    const isOpen = isShopOpen();
    if (!isOpen) {
        const dayName = DAYS_OF_WEEK[new Date().getDay()];
        const todayData = shopSettings.schedule ? shopSettings.schedule[dayName] : null;

        const closedBanner = document.createElement('div');
        closedBanner.style = "grid-column: 1 / -1; background: #fff4f4; color: #e23744; padding: 20px; border-radius: 12px; border: 1px solid #ffccd1; text-align: center; margin-bottom: 2rem; font-weight: bold;";
        
        let message = `🌙 Shop is Currently Closed for today.`;
        if (todayData && !todayData.isClosed) {
            message = `<div style="font-size: 1.5rem; margin-bottom: 5px;">🌙 Shop is Currently Closed</div>
                       <div>Today's hours: ${todayData.open} to ${todayData.close}. Please visit us later!</div>`;
        } else if (todayData && todayData.isClosed) {
            message = `<div style="font-size: 1.5rem; margin-bottom: 5px;">🌙 Closed for ${dayName}</div>
                       <div>We are taking a break today. See you tomorrow!</div>`;
        }

        closedBanner.innerHTML = message;
        foodGrid.appendChild(closedBanner);
    }
    
    if (products.length === 0) {
        foodGrid.innerHTML = '<div class="no-results" style="grid-column:1/-1; text-align:center; padding: 50px;">No food items found matching your criteria.</div>';
        return;
    }

    products.forEach(product => {
        const isOutOfStock = product.isAvailable === false;
        const qty = cart
            .filter(item => item.id === product.id)
            .reduce((sum, item) => sum + item.quantity, 0);

        const card = document.createElement('div');
        card.className = `food-card ${isOutOfStock ? 'out-of-stock' : ''}`;
        
        const isSpicyCategory = !(product.category || '').toLowerCase().includes('masala') && 
                                !(product.category || '').toLowerCase().includes('spice') && 
                                !(product.category || '').toLowerCase().includes('powder');

        // --- Footer Logic: Show Add Button or Qty Selector ---
        let controlUI = '';
        if (isOutOfStock) {
            controlUI = `<button class="swiggy-add-btn" disabled style="color: #666; width: 100%;">Sold Out</button>`;
        } else if (!isOpen) {
            controlUI = `<button class="swiggy-add-btn" style="background:#eee; color:#999; cursor:not-allowed;" onclick="showToast('Shop is closed!', 'error')" disabled>Closed</button>`;
        } else if (qty > 0) {
            controlUI = `
                <div class="cart-qty-ctrl" style="border-radius: 8px;">
                    <div style="cursor:pointer; padding: 0 10px;" onclick="updateItemQty('${product.id}', -1)">−</div>
                    <div style="font-weight: 800;">${qty}</div>
                    <div style="cursor:pointer; padding: 0 10px;" onclick="updateItemQty('${product.id}', 1)">+</div>
                </div>`;
        } else if (isSpicyCategory) {
            controlUI = `<button class="swiggy-add-btn" onclick="showProductDetails('${product.id}')">ADD</button>`;
        } else {
            controlUI = `<button class="swiggy-add-btn" onclick="updateItemQty('${product.id}', 1)">ADD</button>`;
        }
        card.innerHTML = `
            <div class="food-img-wrapper" onclick="showProductDetails('${product.id}')" style="cursor: pointer;" title="Click to view details">
                <img src="${product.imageUrl || 'https://via.placeholder.com/300x200?text=Food'}" alt="${product.name}">
                <div class="food-overlay">
                    <div class="food-offer">${product.offer || 'DELICIOUS'}</div>
                </div>
            </div>
            <div class="food-info">
                <div class="food-title">${product.name}</div>
                <div class="food-rating-row">
                    <div class="rating-badge">⭐ 4.2</div>
                    <div class="food-tags">${product.category} • ${product.unit || 'PCS'}</div>
                </div>
                <div class="food-bottom">
                    <div class="food-price">₹${product.price}</div>
                    <div id="control-${product.id}">
                        ${controlUI}
                    </div>
                </div>
            </div>
        `;
        foodGrid.appendChild(card);
    });
}

// Update Item Quantity directly from the card
window.updateItemQty = (productId, change) => {
    const product = allProducts.find(p => p.id === productId);
    const defaultSpice = product ? (product.spiceLevel || 'Normal Spicy') : 'Normal Spicy';
    
    // Find if we have any existing cart item for this product, if so reuse its spice level
    const existing = cart.find(item => item.id === productId);
    const selectedSpice = existing ? existing.spiceLevel : defaultSpice;
    
    updateItemQtyWithSpice(productId, change, selectedSpice);
};

// Update item quantities with custom spice level
window.updateItemQtyWithSpice = (productId, change, selectedSpice) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const cartKey = `${productId}_${selectedSpice}`;
    const cartIdx = cart.findIndex(item => item.cartKey === cartKey);

    if (cartIdx > -1) {
        cart[cartIdx].quantity += change;
        if (cart[cartIdx].quantity <= 0) {
            cart.splice(cartIdx, 1);
            showToast(`${product.name} [${selectedSpice}] removed from cart`);
        }
    } else if (change > 0) {
        cart.push({
            ...product,
            cartKey: cartKey,
            spiceLevel: selectedSpice,
            quantity: 1
        });
        showToast(`${product.name} [${selectedSpice}] added to cart!`, 'success');
    }

    localStorage.setItem('food_cart', JSON.stringify(cart));
    updateCartCount();
    renderProducts(allProducts); // Reflect change on all cards
};

// Update UI
function updateCartCount() {
    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (cartCountSpan) cartCountSpan.textContent = totalCount;
    if (cartCountMobSpan) cartCountMobSpan.textContent = totalCount;
}

// Search
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term));
    renderProducts(filtered);
});

function renderCategoryFilters(products) {
    if (!catFilters) return;
    
    const categories = ['All', ...new Set(products.map(p => p.category).filter(c => c))];
    
    catFilters.innerHTML = '';
    categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `cat-pill ${cat === 'All' ? 'active' : ''}`;
        pill.dataset.category = cat;
        pill.innerText = cat === 'Veg' ? 'Pure Veg' : cat;
        
        pill.onclick = (e) => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const selected = pill.dataset.category;
            if (selected === 'All') {
                renderProducts(allProducts);
            } else {
                const filtered = allProducts.filter(p => p.category === selected);
                renderProducts(filtered);
            }
        };
        catFilters.appendChild(pill);
    });
}

const handleLogout = () => {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    });
};

if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (logoutBtnMob) logoutBtnMob.addEventListener('click', handleLogout);

// --- Product Details Modal ---
let selectedRating = 5;

window.showProductDetails = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    // Check if modal overlay already exists, otherwise create it
    let modal = document.getElementById('product-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'product-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '11000'; // above all other overlays
        document.body.appendChild(modal);
    }

    // Determine default spice rating or chilis markup
    let spiceChilis = '';
    if (product.spiceLevel) {
        let count = 1;
        const sl = product.spiceLevel.toLowerCase();
        if (sl.includes('extra') || sl.includes('high')) count = 4;
        else if (sl.includes('spicy') || sl.includes('hot')) count = 3;
        else if (sl.includes('medium')) count = 2;
        spiceChilis = '🌶️'.repeat(count);
    }

    // Check login status for review form
    const isLoggedIn = auth.currentUser !== null;
    const reviewFormHtml = isLoggedIn ? `
        <div id="review-form-container" style="background:rgba(255,255,255,0.02); padding:16px; border-radius:var(--radius-sm); border:1px solid var(--border-glass);">
            <h5 style="margin:0 0 12px; font-size:0.9rem; font-weight:700; color:var(--text-light);">Write a Review</h5>
            <div id="review-stars-selector" style="display:flex; gap:6px; font-size:1.4rem; margin-bottom:12px; cursor:pointer;">
                <span data-rating="1" onclick="setReviewRating(1)">⭐</span>
                <span data-rating="2" onclick="setReviewRating(2)">⭐</span>
                <span data-rating="3" onclick="setReviewRating(3)">⭐</span>
                <span data-rating="4" onclick="setReviewRating(4)">⭐</span>
                <span data-rating="5" onclick="setReviewRating(5)">⭐</span>
            </div>
            <textarea id="review-form-comment" rows="2" placeholder="Share your experience (e.g. delicious, spicy, fresh)..." style="width:100%; padding:10px; border-radius:6px; font-size:0.85rem; background:rgba(0,0,0,0.2); color:var(--text-light); border:1px solid var(--border-glass); margin-bottom:12px; resize:none;"></textarea>
            <button type="button" class="btn-primary" onclick="submitProductReview('${product.id}')" style="padding: 8px 16px; font-size: 0.85rem; border-radius: 6px; width: 100%;">Submit Review</button>
        </div>
    ` : `
        <div style="background:rgba(255,255,255,0.01); border:1px dashed var(--border-glass); padding:15px; border-radius:var(--radius-sm); text-align:center; font-size:0.85rem; color:var(--text-muted);">
            Please <a href="#" onclick="closeProductDetails(); document.getElementById('auth-modal')?.classList.add('active');" style="color:var(--primary); font-weight:700; text-decoration:underline;">login</a> to submit a rating and review.
        </div>
    `;

    // Only render spice level selector for chicken/food items that are not dry spice powders
    const isSpicyCategory = !(product.category || '').toLowerCase().includes('masala') && 
                            !(product.category || '').toLowerCase().includes('spice') && 
                            !(product.category || '').toLowerCase().includes('powder');

    const spiceSelectorHtml = isSpicyCategory ? `
        <div style="border-top: 1px solid var(--border-glass); padding-top:16px; margin-top:16px;">
            <h4 style="font-size:0.95rem; text-transform:uppercase; color:var(--accent-gold); margin-bottom:8px; font-weight:700; letter-spacing:0.5px;">Select Spice Level</h4>
            <select id="detail-spice-level" style="width:100%; padding:10px; border-radius:6px; font-size:0.85rem; background:rgba(0,0,0,0.2); color:var(--text-light); border:1px solid var(--border-glass); margin-bottom:12px;">
                <option value="Normal Spicy">Normal Spicy 🌶️🌶️</option>
                <option value="Less Spicy">Less Spicy 🌶️</option>
                <option value="Medium Spicy">Medium Spicy 🌶️🌶️</option>
                <option value="Extra Spicy">Extra Spicy 🌶️🌶️🌶️🌶️</option>
            </select>
            <button type="button" class="btn-primary" onclick="addFromDetailModal('${product.id}')" style="padding: 10px; font-size: 0.9rem; border-radius: 6px; width: 100%; font-weight: 700;">🛒 Add to Cart</button>
        </div>
    ` : `
        <div style="border-top: 1px solid var(--border-glass); padding-top:16px; margin-top:16px;">
            <button type="button" class="btn-primary" onclick="addFromDetailModal('${product.id}')" style="padding: 10px; font-size: 0.9rem; border-radius: 6px; width: 100%; font-weight: 700;">🛒 Add to Cart</button>
        </div>
    `;

    modal.innerHTML = `
        <div class="modal-card detail-modal-card glass-panel" style="width: 500px; max-width: 90%; padding: 0; overflow: hidden; border-radius: var(--radius-lg);">
            <button class="modal-close" onclick="closeProductDetails()" style="top: 15px; right: 15px; z-index: 10;">✕</button>
            <div style="width: 100%; aspect-ratio: 16/10; overflow: hidden; position: relative;">
                <img src="${product.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop'}" style="width:100%; height:100%; object-fit:cover;">
                ${product.offer ? `<div class="food-overlay" style="top:15px; left:15px;"><div class="food-offer">${product.offer}</div></div>` : ''}
            </div>
            <div style="padding: 24px; max-height: 55vh; overflow-y: auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap: 10px;">
                    <h2 style="font-family:var(--font-sans); font-size:1.6rem; font-weight:800; color:var(--text-light); margin:0; line-height:1.2;">${product.name}</h2>
                    ${spiceChilis ? `<span style="font-size:1.2rem; white-space:nowrap;">${spiceChilis}</span>` : ''}
                </div>
                <div class="food-meta" style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
                    <span class="category-tag" style="font-size:0.8rem; font-weight:700; color:var(--accent-gold); text-transform:uppercase;">${product.category}</span>
                    <span id="detail-avg-rating" class="rating-badge" style="background:rgba(16,185,129,0.15); color:var(--success); font-size:0.8rem; font-weight:700; padding:2px 8px; border-radius:4px;">⭐ Loading...</span>
                    ${product.cookingTime ? `<span style="font-size:0.8rem; color:var(--text-muted);">🕒 ${product.cookingTime}</span>` : ''}
                </div>
                
                ${spiceSelectorHtml}
                
                <div style="border-top: 1px solid var(--border-glass); padding-top:16px; margin-top:16px;">
                    <h4 style="font-size:0.95rem; text-transform:uppercase; color:var(--accent-gold); margin-bottom:8px; font-weight:700; letter-spacing:0.5px;">Description</h4>
                    <p style="font-size:0.95rem; line-height:1.6; color:var(--text-muted); margin:0; white-space:pre-wrap;">${product.description || 'No description available for this delicious cut.'}</p>
                </div>
                
                <!-- Reviews & Ratings Section -->
                <div style="border-top: 1px solid var(--border-glass); padding-top:16px; margin-top:20px;">
                    <h4 style="font-size:0.95rem; text-transform:uppercase; color:var(--accent-gold); margin-bottom:12px; font-weight:700; letter-spacing:0.5px;">Customer Reviews</h4>
                    <div id="reviews-list-container" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px; max-height:220px; overflow-y:auto; padding-right:5px;">
                        <div style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">Loading reviews...</div>
                    </div>
                    ${reviewFormHtml}
                </div>
            </div>
        </div>
    `;

    // Trigger display
    setTimeout(() => {
        modal.classList.add('active');
        selectedRating = 5;
        setReviewRating(5);
        loadProductReviews(product.id);
    }, 50);
};

window.addFromDetailModal = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const spiceSelect = document.getElementById('detail-spice-level');
    const selectedSpice = spiceSelect ? spiceSelect.value : (product.spiceLevel || 'Normal Spicy');

    updateItemQtyWithSpice(productId, 1, selectedSpice);
    closeProductDetails();
};

window.closeProductDetails = () => {
    const modal = document.getElementById('product-detail-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.setReviewRating = (rating) => {
    selectedRating = rating;
    const stars = document.querySelectorAll('#review-stars-selector span');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.style.opacity = '1';
            star.style.filter = 'none';
        } else {
            star.style.opacity = '0.3';
            star.style.filter = 'grayscale(100%)';
        }
    });
};

window.loadProductReviews = async (productId) => {
    const reviewsContainer = document.getElementById('reviews-list-container');
    const avgRatingSpan = document.getElementById('detail-avg-rating');
    if (!reviewsContainer) return;

    try {
        const q = query(collection(db, "reviews"), where("productId", "==", productId));
        const snap = await getDocs(q);
        
        let totalRating = 0;
        let reviewsCount = 0;
        let html = '';

        const docsList = snap.docs.map(doc => doc.data());
        // Sort by timestamp desc locally
        docsList.sort((a, b) => {
            const tA = a.timestamp?.seconds || 0;
            const tB = b.timestamp?.seconds || 0;
            return tB - tA;
        });

        docsList.forEach(rev => {
            totalRating += rev.rating;
            reviewsCount++;
            const dateStr = rev.timestamp ? new Date(rev.timestamp.seconds * 1000).toLocaleDateString() : 'Just now';
            html += `
                <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); padding:10px 14px; border-radius:6px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem;">
                        <strong style="color:var(--text-light); font-weight:700;">${rev.userName || 'Verified Buyer'}</strong>
                        <span style="color:var(--accent-gold); font-size:0.8rem;">${'⭐'.repeat(rev.rating)}</span>
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 4px; line-height:1.4;">${rev.comment || 'No comment left.'}</p>
                    <small style="color:var(--text-muted); font-size:0.75rem; opacity:0.6;">${dateStr}</small>
                </div>
            `;
        });

        if (reviewsCount === 0) {
            reviewsContainer.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; font-style:italic; padding:10px 0;">No reviews yet. Be the first to review!</div>`;
            avgRatingSpan.innerHTML = `⭐ 4.5 <span style="font-size:0.75rem; font-weight:normal; opacity:0.7;">(Default)</span>`;
        } else {
            reviewsContainer.innerHTML = html;
            const avg = (totalRating / reviewsCount).toFixed(1);
            avgRatingSpan.textContent = `⭐ ${avg} (${reviewsCount} review${reviewsCount > 1 ? 's' : ''})`;
        }
    } catch (err) {
        console.error("Error loading reviews:", err);
        reviewsContainer.innerHTML = `<div style="color:var(--error); font-size:0.85rem;">Error loading reviews.</div>`;
    }
};

window.submitProductReview = async (productId) => {
    const user = auth.currentUser;
    if (!user) {
        showToast("Please login to write a review.", "info");
        return;
    }

    const commentInput = document.getElementById('review-form-comment');
    const comment = commentInput ? commentInput.value.trim() : '';

    if (!comment) {
        showToast("Please write a review comment.", "error");
        return;
    }

    let userName = 'Customer';
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            userName = snap.data().name || 'Customer';
        }
    } catch (e) {
        console.warn("Could not fetch user name for review:", e);
    }

    try {
        showToast("Submitting review...", "info");
        await addDoc(collection(db, "reviews"), {
            productId: productId,
            userId: user.uid,
            userName: userName,
            rating: selectedRating,
            comment: comment,
            timestamp: serverTimestamp()
        });

        showToast("Review submitted successfully!", "success");
        if (commentInput) commentInput.value = '';
        
        setReviewRating(5);
        loadProductReviews(productId);
    } catch (err) {
        console.error("Error submitting review:", err);
        showToast("Failed to submit review.", "error");
    }
};
