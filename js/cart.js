import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    serverTimestamp,
    onSnapshot,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

// Elements
const cartList = document.getElementById('cart-list');
const emptyCartMsg = document.getElementById('empty-cart-msg');
const checkoutArea = document.getElementById('checkout-area');
const checkoutForm = document.getElementById('checkout-form');
const grandTotalSpan = document.getElementById('grand-total');
const deliveryInfo = document.getElementById('delivery-info');
const areaSelect = document.getElementById('delivery-area');
const applyCouponBtn = document.getElementById('apply-coupon-btn');
const couponInput = document.getElementById('coupon-input');
const couponMsg = document.getElementById('coupon-msg');

let cart = JSON.parse(localStorage.getItem('food_cart_v2')) || [];
let currentUser = null;
let allLocations = [];
let appliedCoupon = null;

// Auth check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }
    currentUser = user;
    
    // Auto-fill user details from Firestore profile
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then(snap => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.name && !document.getElementById('cust-name').value) {
                document.getElementById('cust-name').value = data.name;
            }
            if (data.mobile && !document.getElementById('cust-phone').value) {
                document.getElementById('cust-phone').value = data.mobile;
            }
            if (data.email && !document.getElementById('cust-email').value) {
                document.getElementById('cust-email').value = data.email;
            }
        }
    }).catch(err => console.error("Error auto-filling profile:", err));

    renderCart();
    setupListeners();
});

function setupListeners() {
    // 🔄 Switch Order Type
    const radioInputs = document.querySelectorAll('input[name="order-type"]');
    radioInputs.forEach(input => {
        input.addEventListener('change', () => {
            const type = input.value;
            console.log("Order type changed to:", type);
            
            // Toggle Visibility
            if (type === 'Delivery') {
                deliveryInfo.classList.remove('hidden');
                document.getElementById('cust-address').required = true;
            } else {
                deliveryInfo.classList.add('hidden');
                document.getElementById('cust-address').required = false;
                if (areaSelect) areaSelect.value = "0";
            }
            renderCart();
        });
    });

    if (areaSelect) {
        areaSelect.onchange = () => renderCart();
    }

    // 🎫 Coupon Application
    if (applyCouponBtn) {
        applyCouponBtn.onclick = async () => {
            const code = couponInput.value.trim().toUpperCase();
            if (!code) return;

            const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            
            try {
                const q = query(collection(db, "coupons"), where("code", "==", code), where("active", "==", true));
                const snap = await getDocs(q);

                if (snap.empty) {
                    couponMsg.innerText = "❌ Invalid or expired coupon";
                    couponMsg.style.color = "var(--error)";
                    appliedCoupon = null;
                } else {
                    const cp = { id: snap.docs[0].id, ...snap.docs[0].data() };
                    
                    if (subtotal < cp.minOrder) {
                        couponMsg.innerText = `❌ Min. order ₹${cp.minOrder} required`;
                        couponMsg.style.color = "var(--error)";
                        appliedCoupon = null;
                    } else {
                        appliedCoupon = cp;
                        couponMsg.innerText = `✅ Coupon Applied: ${cp.type === 'percentage' ? cp.value + '%' : '₹' + cp.value} off!`;
                        couponMsg.style.color = "var(--success)";
                    }
                }
                renderCart();
            } catch (err) {
                console.error(err);
                showToast("Error applying coupon", "error");
            }
        };
    }
}

function renderCart() {
    // Clear items but keep empty cart message element
    const items = cartList.querySelectorAll('.cart-item');
    items.forEach(el => el.remove());

    if (cart.length === 0) {
        if (emptyCartMsg) emptyCartMsg.classList.remove('hidden');
        if (checkoutArea) checkoutArea.classList.add('hidden');
        return;
    }

    if (emptyCartMsg) emptyCartMsg.classList.add('hidden');
    if (checkoutArea) checkoutArea.classList.remove('hidden');

    let total = 0;
    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const card = document.createElement('div');
        card.className = 'cart-item fade-in';
        card.innerHTML = `
            <img src="${item.imageUrl || 'https://via.placeholder.com/80?text=Food'}" class="cart-item-img">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                ${item.variantName ? `<div class="cart-item-variant">Variant: ${item.variantName}</div>` : ''}
                ${item.spiceLevel ? `<div class="cart-item-spice" style="font-size: 0.8rem; color: var(--accent-gold); margin-top: 2px;">Spice: ${item.spiceLevel}</div>` : ''}
                <div class="qty-control">
                    <button type="button" class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                    <span style="font-weight:700; font-size:0.9rem;">${item.quantity}</span>
                    <button type="button" class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                </div>
            </div>
            <div class="cart-item-price">
                <span>₹${item.price * item.quantity}</span>
                <button type="button" class="remove-btn" onclick="removeItem(${index})">🗑</button>
            </div>
        `;
        cartList.appendChild(card);
    });

    // Subtotal math
    document.getElementById('summary-subtotal').textContent = `₹${total}`;

    const selectedTypeInput = document.querySelector('input[name="order-type"]:checked');
    const isDelivery = selectedTypeInput && selectedTypeInput.value === 'Delivery';

    // Delivery math
    let deliveryFee = 0;
    const deliveryRow = document.getElementById('summary-delivery-row');
    if (isDelivery) {
        deliveryRow.style.display = 'flex';
        if (areaSelect && areaSelect.value !== "0") {
            deliveryFee = parseFloat(areaSelect.options[areaSelect.selectedIndex].dataset.fee) || 0;
        } else {
            deliveryFee = 40; // Default fallback
        }
        document.getElementById('summary-delivery').textContent = `₹${deliveryFee}`;
    } else {
        deliveryRow.style.display = 'none';
    }

    // Coupon calculation
    let discount = 0;
    const discountRow = document.getElementById('summary-discount-row');
    if (appliedCoupon) {
        if (total >= appliedCoupon.minOrder) {
            if (appliedCoupon.type === 'percentage') {
                discount = Math.round((total * appliedCoupon.value) / 100);
            } else {
                discount = appliedCoupon.value;
            }
            discountRow.style.display = 'flex';
            document.getElementById('summary-discount').textContent = `-₹${discount}`;
        } else {
            appliedCoupon = null;
            couponMsg.innerText = '';
            discountRow.style.display = 'none';
            showToast(`Coupon removed. Min order required is ₹${appliedCoupon.minOrder}`, 'info');
        }
    } else {
        discountRow.style.display = 'none';
    }

    const finalTotal = total + deliveryFee - discount;
    if (grandTotalSpan) {
        grandTotalSpan.textContent = `₹${Math.max(0, Math.round(finalTotal))}`;
    }
}

// Global functions for the buttons
window.updateQty = (index, change) => {
    cart[index].quantity += change;
    if (cart[index].quantity < 1) cart[index].quantity = 1;
    localStorage.setItem('food_cart_v2', JSON.stringify(cart));
    renderCart();
};

window.removeItem = (index) => {
    const item = cart[index];
    cart.splice(index, 1);
    localStorage.setItem('food_cart_v2', JSON.stringify(cart));
    showToast(`${item.name} removed from cart`);
    renderCart();
};

// Fetch Locations for Dropdown
onSnapshot(collection(db, "locations"), (snap) => {
    allLocations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (areaSelect) {
        areaSelect.innerHTML = '<option value="0" data-fee="0">Select Area (Fee Apply)</option>';
        allLocations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.dataset.fee = loc.fee;
            opt.textContent = `${loc.name} (+₹${loc.fee})`;
            areaSelect.appendChild(opt);
        });
    }
});

function generateOrderId() {
    const d = new Date();
    const date = d.toISOString().slice(0,10).replace(/-/g,"");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SPR-${date}-${rand}`;
}

// Form checkout submission
if (checkoutForm) {
    checkoutForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('place-order-btn');
        btn.disabled = true;
        
        if (cart.length === 0) {
            showToast("Your cart is empty", "error");
            btn.disabled = false;
            return;
        }

        const selectedTypeInput = document.querySelector('input[name="order-type"]:checked');
        const orderType = selectedTypeInput.value;
        const name = document.getElementById('cust-name').value.trim();
        const phone = document.getElementById('cust-phone').value.trim();
        const email = document.getElementById('cust-email').value.trim();
        const address = document.getElementById('cust-address').value.trim();
        const notes = document.getElementById('cust-notes').value.trim();
        
        // --- Mandatory Delivery Area Check ---
        if (orderType === 'Delivery' && (!areaSelect || areaSelect.value === "0")) {
            showToast("Please select a delivery area!", "error");
            btn.disabled = false;
            return;
        }
        if (orderType === 'Delivery' && !address) {
            showToast("Please enter your full delivery address!", "error");
            btn.disabled = false;
            return;
        }
        
        showToast("Processing order...", "info");

        const orderId = generateOrderId();
        const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const deliveryCharge = orderType === 'Delivery' ? (parseFloat(areaSelect?.options[areaSelect.selectedIndex]?.dataset.fee) || 0) : 0;
        
        let discount = 0;
        if (appliedCoupon) {
            discount = appliedCoupon.type === 'percentage' ? Math.round((subtotal * appliedCoupon.value) / 100) : appliedCoupon.value;
        }

        const finalPrice = Math.max(0, Math.round(subtotal + deliveryCharge - discount));

        const orderPayload = {
            orderId: orderId,
            customerId: currentUser.uid,
            userId: currentUser.uid,
            customerName: name,
            phone: phone,
            email: email,
            address: orderType === 'Delivery' ? address : 'Takeaway',
            notes: notes,
            items: cart.map(i => ({
                id: i.id,
                name: i.name,
                variantName: i.variantName || '',
                price: i.price,
                quantity: i.quantity,
                spiceLevel: i.spiceLevel || ''
            })),
            subtotal: subtotal,
            discount: discount,
            deliveryArea: orderType === 'Delivery' ? (areaSelect?.options[areaSelect.selectedIndex]?.text || 'N/A') : 'N/A',
            deliveryFee: deliveryCharge,
            totalPrice: finalPrice,
            orderType: orderType,
            paymentMethod: 'COD',
            status: 'Pending',
            timestamp: serverTimestamp()
        };

        try {
            // 1. Save order in Firestore
            const orderRef = await addDoc(collection(db, "orders"), orderPayload);

            // 2. Build WhatsApp checkout message
            let msg = `*Order ID:* ${orderId}%0A*Time:* ${new Date().toLocaleString()}%0A`;
            msg += `*Customer:* ${name}%0A*Phone:* ${phone}%0A*Type:* ${orderType}%0A`;
            if (orderType === 'Delivery') {
                msg += `*Address:* ${address}%0A`;
            }
            if (notes) msg += `*Notes:* ${notes}%0A`;
            msg += `%0A*Items Order:*%0A`;

            cart.forEach(i => {
                const spiceStr = i.spiceLevel ? ` [Spice: ${i.spiceLevel}]` : '';
                msg += `• ${i.name} ${i.variantName ? `(${i.variantName})` : ''}${spiceStr} x${i.quantity} = ₹${i.price * i.quantity}%0A`;
            });

            msg += `%0A-----------------%0A`;
            msg += `*Subtotal:* ₹${subtotal}%0A`;
            if (discount > 0) msg += `*Discount:* -₹${discount}%0A`;
            if (deliveryCharge > 0) msg += `*Delivery Fee:* ₹${deliveryCharge}%0A`;
            msg += `*Total Amount:* *₹${finalPrice}*%0A%0A`;
            msg += `_Order submitted. Awaiting confirmation on WhatsApp._`;

            showToast("Order Saved! Redirecting to WhatsApp...", "success");

            // 3. Read admin WhatsApp number from Firestore settings, then open WhatsApp
            let adminWANumber = '918754743213'; // fallback
            try {
                const settingsSnap = await getDoc(doc(db, 'settings', 'shop'));
                if (settingsSnap.exists() && settingsSnap.data().whatsappNumber) {
                    adminWANumber = settingsSnap.data().whatsappNumber;
                }
            } catch (e) {
                console.warn('Could not fetch WhatsApp number from settings, using default.', e);
            }

            const waLink = `https://wa.me/${adminWANumber}?text=` + msg;
            window.open(waLink, "_blank");

            // 4. Clear state & localStorage
            cart = [];
            localStorage.removeItem('food_cart_v2');
            appliedCoupon = null;
            couponInput.value = '';
            checkoutForm.reset();

            setTimeout(() => {
                window.location.href = `orders.html?id=${orderRef.id}`;
            }, 1000);
        } catch (error) {
            console.error("Order submission failed:", error);
            showToast("Error placing order. Please try again.", "error");
            btn.disabled = false;
        }
    };
}

const logoutBtnMob = document.getElementById('logout-btn-mob');
if (logoutBtnMob) {
    logoutBtnMob.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = '../index.html';
        });
    });
}
