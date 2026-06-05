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
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showToast } from './ui-utils.js';

// --- DOM Elements ---
const mainNavbar = document.getElementById('main-navbar');
const foodSearch = document.getElementById('food-search');
const btnVoiceSearch = document.getElementById('btn-voice-search');
const btnCartToggle = document.getElementById('btn-cart-toggle');
const btnCartToggleMob = document.getElementById('btn-cart-toggle-mob');

// Views
const heroBanner = document.getElementById('hero-banner');
const viewHome = document.getElementById('view-home');
const viewChicken = document.getElementById('view-chicken');
const viewMasalas = document.getElementById('view-masalas');
const viewAbout = document.getElementById('view-about');

// Grids
const featuredFoodGrid = document.getElementById('featured-food-grid');
const chickenGrid = document.getElementById('chicken-grid');
const masalaGrid = document.getElementById('masala-grid');
const chickenFilters = document.getElementById('chicken-filters');
const masalaFilters = document.getElementById('masala-filters');

// Chatbot DOM
const chatbotBtn = document.getElementById('chatbot-btn');
const chatbotPanel = document.getElementById('chatbot-panel');
const chatbotClose = document.getElementById('chatbot-close');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotSend = document.getElementById('chatbot-send');
const chatbotBody = document.getElementById('chatbot-body');

// Voice DOM
const voiceModal = document.getElementById('voice-modal');
const btnVoiceCancel = document.getElementById('btn-voice-cancel');

// --- State Variables ---
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('food_cart_v2')) || [];
let activeCoupon = null;
let currentView = 'home';
let activeChickenFilter = 'All';
let activeMasalaFilter = 'All';
let shopSettings = { schedule: {} };
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// --- 1. SPA View Router ---
const viewsMap = {
    home: { sec: viewHome, showHero: true },
    chicken: { sec: viewChicken, showHero: false },
    masalas: { sec: viewMasalas, showHero: false },
    about: { sec: viewAbout, showHero: false }
};

function switchView(viewName) {
    if (!viewsMap[viewName]) return;
    
    currentView = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Toggle Section displays
    Object.keys(viewsMap).forEach(key => {
        const v = viewsMap[key];
        if (key === viewName) {
            v.sec.classList.remove('hidden');
        } else {
            v.sec.classList.add('hidden');
        }
    });

    // Toggle Hero display
    if (viewsMap[viewName].showHero) {
        heroBanner.classList.remove('hidden');
    } else {
        heroBanner.classList.add('hidden');
    }

    // Update active class on nav links
    document.querySelectorAll('.nav-link, .mob-nav-item').forEach(el => {
        if (el.getAttribute('data-view') === viewName) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Load elements specific to the view
    if (viewName === 'chicken' || viewName === 'masalas') {
        renderFilteredProducts();
    }
}

// Router Event Listeners
document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.getAttribute('data-view');
        switchView(view);
        
        // Update URL hash without reload
        history.pushState(null, null, `#${view}`);
    });
});

// Sync router on page load hash
window.addEventListener('load', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && viewsMap[hash]) {
        switchView(hash);
    } else {
        switchView('home');
    }
});

// Navbar scroll background change
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        mainNavbar.classList.add('scrolled');
    } else {
        mainNavbar.classList.remove('scrolled');
    }
});

// --- 2. Spice Particles Canvas Animation ---
const canvas = document.getElementById('spice-particles');
const ctx = canvas.getContext('2d');

let particles = [];
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class SpiceParticle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + Math.random() * 100;
        this.size = Math.random() * 3 + 1;
        this.speedY = Math.random() * 1.5 + 0.5;
        this.speedX = Math.sin(Math.random() * 2) * 0.5;
        this.alpha = Math.random() * 0.5 + 0.3;
        // Chillis, turmeric or coriander seed colors
        const colors = ['#ff4a22', '#f59e0b', '#d4af37', '#e21d48'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
        this.y -= this.speedY;
        this.x += this.speedX;
        if (this.y < -10) {
            this.reset();
        }
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }
}

// Populate particles
for (let i = 0; i < 35; i++) {
    particles.push(new SpiceParticle());
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only draw particles if home hero banner is visible
    if (currentView === 'home') {
        particles.forEach(p => {
            p.update();
            p.draw();
        });
    }
    
    requestAnimationFrame(animateParticles);
}
animateParticles();

// --- 3. Hero Slideshow & Typing Title Loop ---
let currentSlide = 0;
const slides = document.querySelectorAll('.hero-slide');
function cycleSlides() {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
}
setInterval(cycleSlides, 6000);

// Typing text cycle
const typingText = document.getElementById('typing-text');
const wordsList = ["Premium Marinated Chicken cuts", "Preservative-Free Spices", "Cleaned & Ready to Pan Fry", "Farm Fresh Ingredients"];
let wordIdx = 0;
let charIdx = 0;
let isDeleting = false;

function typeAnimation() {
    const currentWord = wordsList[wordIdx];
    if (isDeleting) {
        typingText.textContent = currentWord.substring(0, charIdx - 1);
        charIdx--;
    } else {
        typingText.textContent = currentWord.substring(0, charIdx + 1);
        charIdx++;
    }

    let speed = isDeleting ? 40 : 80;

    if (!isDeleting && charIdx === currentWord.length) {
        speed = 2500; // Wait at complete word
        isDeleting = true;
    } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        wordIdx = (wordIdx + 1) % wordsList.length;
        speed = 500;
    }

    setTimeout(typeAnimation, speed);
}
setTimeout(typeAnimation, 1000);

// --- 4. Intersection Observer: Scroll Fade-Ins & Stats ---
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animated');
            // Trigger stats counters if this is the stats section
            if (entry.target.classList.contains('stats-section')) {
                animateCounters();
            }
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.scroll-animate').forEach(el => {
    scrollObserver.observe(el);
});

function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
        if (counter.classList.contains('counted')) return;
        counter.classList.add('counted');
        
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; // 2 seconds
        const startTime = performance.now();

        function updateCount(currentTime) {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            const value = Math.floor(progress * target);
            
            counter.innerText = value.toLocaleString() + (target === 98 ? "%" : (target === 45 || target === 15 ? "" : "+"));

            if (progress < 1) {
                requestAnimationFrame(updateCount);
            }
        }
        requestAnimationFrame(updateCount);
    });
}

// --- 5. Firebase Product Fetching & Rendering ---
let selectedVariants = {}; // tracks selected variants per card, e.g. { productId: variantName }

// Shop status checks
async function checkShopStatus() {
    const snap = await getDoc(doc(db, "settings", "shop"));
    if (snap.exists()) {
        shopSettings = snap.data();
    }
}
checkShopStatus();

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

// Real-time listener
const q = query(collection(db, "products"));
onSnapshot(q, (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHomeFeatured();
    renderFilteredProducts();
    updateCartCount();
});

// Render chef choices (featured) on home view
function renderHomeFeatured() {
    if (!featuredFoodGrid) return;
    // Featured are available items containing offer badges, or first 3
    let featured = allProducts.filter(p => p.isAvailable !== false && p.offer).slice(0, 3);
    if (featured.length === 0) featured = allProducts.slice(0, 3);
    
    renderProductCards(featured, featuredFoodGrid);
}

// Filter and render for shop categories
function renderFilteredProducts() {
    const isChicken = currentView === 'chicken';
    const grid = isChicken ? chickenGrid : masalaGrid;
    const filterContainer = isChicken ? chickenFilters : masalaFilters;
    const activeFilter = isChicken ? activeChickenFilter : activeMasalaFilter;
    
    if (!grid) return;
    
    // Distinguish products:
    // We treat as Masala if category matches 'masala', 'spices', 'spice mix' (case-insensitive), or if unit is 'PACKET'.
    // Otherwise it is Chicken.
    const products = allProducts.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const isMasalaCat = cat.includes('masala') || cat.includes('spice') || cat.includes('powder');
        return isChicken ? !isMasalaCat : isMasalaCat;
    });

    // Render Filters
    if (filterContainer) {
        const subCats = ['All', ...new Set(products.map(p => p.category).filter(c => c))];
        filterContainer.innerHTML = '';
        subCats.forEach(cat => {
            const pill = document.createElement('button');
            pill.className = `cat-pill ${cat === activeFilter ? 'active' : ''}`;
            pill.innerText = cat;
            pill.addEventListener('click', () => {
                if (isChicken) {
                    activeChickenFilter = cat;
                } else {
                    activeMasalaFilter = cat;
                }
                renderFilteredProducts();
            });
            filterContainer.appendChild(pill);
        });
    }

    // Apply active filter
    let filtered = products;
    if (activeFilter !== 'All') {
        filtered = products.filter(p => p.category === activeFilter);
    }

    // Apply Search term if search bar has content
    const term = foodSearch.value.trim().toLowerCase();
    if (term) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
    }

    renderProductCards(filtered, grid);
}

// Shared renderer
function renderProductCards(products, targetGrid) {
    targetGrid.innerHTML = '';
    
    const isOpen = isShopOpen();
    if (!isOpen) {
        const closedMsg = document.createElement('div');
        closedMsg.style = "grid-column: 1/-1; background: rgba(239, 68, 68, 0.15); border: 1px solid var(--primary); padding: 18px; border-radius: var(--radius-md); text-align: center; color: var(--primary); font-weight: 700;";
        closedMsg.innerText = "🌙 Shop is currently closed. You can pre-add items to your cart, but order placement is offline.";
        targetGrid.appendChild(closedMsg);
    }

    if (products.length === 0) {
        targetGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">No products found matching the criteria.</div>';
        return;
    }

    products.forEach(product => {
        const isOutOfStock = product.isAvailable === false || (product.stock !== undefined && product.stock <= 0);
        
        // Handle variant default selection
        const hasVariants = product.variants && product.variants.length > 0;
        let selectedVariantName = selectedVariants[product.id];
        
        if (hasVariants && !selectedVariantName) {
            // default to first variant
            selectedVariantName = product.variants[0].name;
            selectedVariants[product.id] = selectedVariantName;
        }

        // Get price based on selection
        let displayPrice = product.price;
        if (hasVariants) {
            const vObj = product.variants.find(v => v.name === selectedVariantName);
            if (vObj) displayPrice = vObj.price;
        }

        // Get cart quantity for this specific variant (summed across all spice levels)
        const qty = cart
            .filter(item => item.id === product.id && item.variantName === (selectedVariantName || ''))
            .reduce((sum, item) => sum + item.quantity, 0);

        // Spice levels indicators
        let spiceMarkup = '';
        if (product.spiceLevel) {
            let chilisCount = 1;
            const sl = product.spiceLevel.toLowerCase();
            if (sl.includes('extra') || sl.includes('high')) chilisCount = 4;
            else if (sl.includes('spicy') || sl.includes('hot')) chilisCount = 3;
            else if (sl.includes('medium')) chilisCount = 2;
            
            spiceMarkup = `<div class="spice-rating" title="Spice Level: ${product.spiceLevel}">` + '🌶️'.repeat(chilisCount) + '</div>';
        }

        // Variant selector dropdown
        let variantUI = '';
        if (hasVariants) {
            const options = product.variants.map(v => `<option value="${v.name}" ${v.name === selectedVariantName ? 'selected' : ''}>${v.name} - ₹${v.price}</option>`).join('');
            variantUI = `
                <div class="variant-selector">
                    <select class="variant-select" onchange="changeProductVariant('${product.id}', this.value)">
                        ${options}
                    </select>
                </div>
            `;
        } else {
            variantUI = `<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Unit: ${product.unit || 'Standard'}</div>`;
        }

        const isSpicyCategory = !(product.category || '').toLowerCase().includes('masala') && 
                                !(product.category || '').toLowerCase().includes('spice') && 
                                !(product.category || '').toLowerCase().includes('powder');

        // Card button actions
        let controlUI = '';
        if (isOutOfStock) {
            controlUI = `<button class="swiggy-add-btn" disabled style="background: rgba(255,255,255,0.05); color:#666; border-color:transparent; cursor:not-allowed; width: 100%;">Sold Out</button>`;
        } else if (qty > 0) {
            controlUI = `
                <div class="cart-qty-ctrl">
                    <div class="qty-control-btn" onclick="updateItemQty('${product.id}', '${selectedVariantName || ''}', -1)">−</div>
                    <div style="font-weight: 800; min-width: 16px; text-align: center;">${qty}</div>
                    <div class="qty-control-btn" onclick="updateItemQty('${product.id}', '${selectedVariantName || ''}', 1)">+</div>
                </div>`;
        } else if (isSpicyCategory) {
            controlUI = `<button class="swiggy-add-btn" onclick="showProductDetails('${product.id}')">ADD</button>`;
        } else {
            controlUI = `<button class="swiggy-add-btn" onclick="updateItemQty('${product.id}', '${selectedVariantName || ''}', 1)">ADD</button>`;
        }

        const card = document.createElement('div');
        card.className = 'food-card scroll-animate animated';
        card.innerHTML = `
            <div class="food-img-wrapper" onclick="showProductDetails('${product.id}')" style="cursor: pointer;" title="Click to view details">
                <img src="${product.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop'}" alt="${product.name}" loading="lazy">
                ${product.offer ? `<div class="food-overlay"><div class="food-offer">${product.offer}</div></div>` : ''}
                ${product.cookingTime ? `<div class="cooking-badge">🕒 ${product.cookingTime}</div>` : ''}
            </div>
            <div class="food-info">
                <div class="food-title-row">
                    <div class="food-title">${product.name}</div>
                    ${spiceMarkup}
                </div>
                <div class="food-meta">
                    <div class="category-tag">${product.category}</div>
                    <div class="rating-badge">⭐ 4.5</div>
                    ${product.stock !== undefined && product.stock <= 3 && product.stock > 0 ? `<div style="font-size:0.75rem; color:var(--primary); font-weight:700; background:rgba(255,74,34,0.1); padding:2px 6px; border-radius:4px;">Only ${product.stock} Left!</div>` : ''}
                </div>
                ${variantUI}
                <div class="food-bottom">
                    <div class="food-price">₹<span>${displayPrice}</span></div>
                    <div id="control-${product.id}-${selectedVariantName || 'none'}">
                        ${controlUI}
                    </div>
                </div>
            </div>
        `;
        targetGrid.appendChild(card);
    });
}

// Handle variant dropdown selection change
window.changeProductVariant = (productId, newVariantName) => {
    selectedVariants[productId] = newVariantName;
    renderHomeFeatured();
    renderFilteredProducts();
};

// Search trigger
foodSearch.addEventListener('input', () => {
    if (currentView === 'home') {
        // If searching on home page, auto switch to Chicken view to show list
        switchView('chicken');
    }
    renderFilteredProducts();
});

// See all featured redirect
document.getElementById('btn-see-all-featured')?.addEventListener('click', () => {
    switchView('chicken');
});

// CTAs
document.getElementById('hero-cta-chicken')?.addEventListener('click', () => {
    switchView('chicken');
});
document.getElementById('hero-cta-masala')?.addEventListener('click', () => {
    switchView('masalas');
});

// --- 6. Shopping Cart Management ---
// Update item quantities with default spice level
window.updateItemQty = (productId, variantName, change) => {
    const product = allProducts.find(p => p.id === productId);
    const defaultSpice = product ? (product.spiceLevel || 'Normal Spicy') : 'Normal Spicy';
    
    // If we have an existing item for this product/variant, keep its spice level
    const existing = cart.find(item => item.id === productId && item.variantName === (variantName || ''));
    const selectedSpice = existing ? existing.spiceLevel : defaultSpice;
    
    updateItemQtyWithSpice(productId, variantName, change, selectedSpice);
};

// Update item quantities with custom spice level
window.updateItemQtyWithSpice = (productId, variantName, change, selectedSpice) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const hasVariants = product.variants && product.variants.length > 0;
    // Include selected spice level in cartKey to support multiple spice levels of the same item
    const cartKey = hasVariants ? `${productId}_${variantName}_${selectedSpice}` : `${productId}_${selectedSpice}`;
    
    // Find price
    let finalPrice = product.price;
    if (hasVariants) {
        const vObj = product.variants.find(v => v.name === variantName);
        if (vObj) finalPrice = vObj.price;
    }

    const cartIdx = cart.findIndex(item => item.cartKey === cartKey);

    if (cartIdx > -1) {
        cart[cartIdx].quantity += change;
        if (cart[cartIdx].quantity <= 0) {
            cart.splice(cartIdx, 1);
            showToast(`${product.name} ${variantName ? `(${variantName})` : ''} [${selectedSpice}] removed from cart`);
        }
    } else if (change > 0) {
        cart.push({
            id: product.id,
            cartKey: cartKey,
            name: product.name,
            variantName: variantName || '',
            price: finalPrice,
            quantity: 1,
            imageUrl: product.imageUrl,
            spiceLevel: selectedSpice
        });
        showToast(`${product.name} [${selectedSpice}] added to cart!`, 'success');
        
        // Trigger cart bounce animation
        if (btnCartToggle) {
            btnCartToggle.style.transform = 'scale(1.2)';
            setTimeout(() => btnCartToggle.style.transform = 'none', 200);
        }
    }

    localStorage.setItem('food_cart_v2', JSON.stringify(cart));
    updateCartCount();
    renderHomeFeatured();
    renderFilteredProducts();
};

function updateCartCount() {
    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    const cartCountEl = document.getElementById('cart-count');
    const cartCountMobEl = document.getElementById('cart-count-mob');
    if (cartCountEl) cartCountEl.textContent = totalCount;
    if (cartCountMobEl) cartCountMobEl.textContent = totalCount;
}

// Redirect or open auth modal on cart click
const handleCartClick = (e) => {
    e.preventDefault();
    if (auth.currentUser) {
        window.location.href = 'customer/cart.html';
    } else {
        showToast("Please login to view your cart.", "info");
        document.getElementById('auth-modal')?.classList.add('active');
    }
};

btnCartToggle?.addEventListener('click', handleCartClick);
btnCartToggleMob?.addEventListener('click', handleCartClick);

// Auth callbacks
window.onAuthSuccess = (userData) => {
    // Left empty since drawer UI is removed
};

window.onAuthLogout = () => {
    // Clear cart locally to secure order leak across users
    cart = [];
    localStorage.removeItem('food_cart_v2');
    updateCartCount();
    renderHomeFeatured();
    renderFilteredProducts();
};


// --- 9. Voice Search Simulated Logic ---
if (btnVoiceSearch) {
    btnVoiceSearch.addEventListener('click', () => {
        voiceModal.classList.add('active');
        
        // Simulate listening for 2.5 seconds
        setTimeout(() => {
            voiceModal.classList.remove('active');
            
            // Randomly simulate search keywords
            const phrases = ["Biryani cut", "Chicken Fry", "Kabab Masala", "Kabab cut", "Chicken Boneless"];
            const match = phrases[Math.floor(Math.random() * phrases.length)];
            foodSearch.value = match;
            
            showToast(`Voice Search Matched: "${match}"`, "success");
            
            // Auto switch to chicken and trigger rendering
            switchView('chicken');
            renderFilteredProducts();
        }, 2500);
    });

    btnVoiceCancel.addEventListener('click', () => {
        voiceModal.classList.remove('active');
    });
}

// --- 10. AI Chatbot Collapsible & Mock Responses ---
if (chatbotBtn && chatbotPanel && chatbotClose) {
    chatbotBtn.addEventListener('click', () => {
        chatbotPanel.classList.toggle('active');
    });
    chatbotClose.addEventListener('click', () => {
        chatbotPanel.classList.remove('active');
    });
}

window.sendQuickChat = (question) => {
    chatbotInput.value = question;
    triggerChatSend();
};

if (chatbotSend) {
    chatbotSend.addEventListener('click', triggerChatSend);
}

chatbotInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') triggerChatSend();
});

function triggerChatSend() {
    const text = chatbotInput.value.trim();
    if (!text) return;

    // Append user message
    appendChatMessage(text, 'user');
    chatbotInput.value = '';

    // Simulate bot thinking
    setTimeout(() => {
        const reply = getBotResponse(text);
        appendChatMessage(reply, 'bot');
    }, 800);
}

function appendChatMessage(msg, sender) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.innerHTML = msg;
    chatbotBody.appendChild(div);
    chatbotBody.scrollTop = chatbotBody.scrollHeight;
}

function getBotResponse(question) {
    const qLower = question.toLowerCase();
    
    if (qLower.includes('hour') || qLower.includes('time') || qLower.includes('open')) {
        return "⏰ We are open from <b>9:00 AM to 10:00 PM</b> every day! If we take a holiday, you'll see a closed banner on the storefront.";
    }
    if (qLower.includes('pack') || qLower.includes('hygiene') || qLower.includes('fresh')) {
        return "📦 All meats are cut in a vacuum-sealed temperature-controlled facility and packed in food-grade bags with cold gel ice pads to ensure they arrive fresh at your door.";
    }
    if (qLower.includes('discount') || qLower.includes('coupon') || qLower.includes('offer')) {
        return "🏷️ Yes! You can use coupon code <b>SAMAYAL20</b> to get <b>Flat 20% Off</b> on your first order of marinated cuts and spices.";
    }
    if (qLower.includes('delivery') || qLower.includes('ship') || qLower.includes('charge')) {
        return "🛵 Delivery is free for orders above ₹500! For orders below ₹500, a standard charge of ₹40 applies. We deliver in under 45 minutes.";
    }
    if (qLower.includes('marinate') || qLower.includes('how to cook')) {
        return "🍗 Cooking is simple: take our marinated cuts, add them directly to a heated pan with oil or grill them. No extra salt or spices needed. Cook for 15-20 mins!";
    }
    
    return "🤖 I appreciate your message! For direct support or bulk catering, please contact us on WhatsApp at <b>+91 87547 43213</b>.";
}

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
        <div id="review-form-container" class="review-form-wrapper">
            <div class="review-form-header">
                <span class="review-quill-icon">✍️</span>
                <h5 class="review-form-title">Write a Review</h5>
            </div>
            <div id="review-stars-selector" class="review-stars-row">
                <span class="review-star" data-rating="1" onclick="setReviewRating(1)">⭐</span>
                <span class="review-star" data-rating="2" onclick="setReviewRating(2)">⭐</span>
                <span class="review-star" data-rating="3" onclick="setReviewRating(3)">⭐</span>
                <span class="review-star" data-rating="4" onclick="setReviewRating(4)">⭐</span>
                <span class="review-star" data-rating="5" onclick="setReviewRating(5)">⭐</span>
            </div>
            <div class="review-textarea-wrap">
                <textarea id="review-form-comment" class="review-textarea" rows="2" placeholder=" "></textarea>
                <label class="review-floating-label">Share your experience (e.g. delicious, spicy, fresh)...</label>
            </div>
            <button type="button" class="review-submit-btn" onclick="submitProductReview('${product.id}')">
                <span class="review-submit-icon">🌟</span>
                <span>Submit Review</span>
            </button>
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

    const hasVariants = product.variants && product.variants.length > 0;
    let selectedVariantName = selectedVariants[productId];
    if (hasVariants && !selectedVariantName) {
        selectedVariantName = product.variants[0].name;
    }

    const spiceSelect = document.getElementById('detail-spice-level');
    const selectedSpice = spiceSelect ? spiceSelect.value : (product.spiceLevel || 'Normal Spicy');

    updateItemQtyWithSpice(productId, selectedVariantName || '', 1, selectedSpice);
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
    const stars = document.querySelectorAll('#review-stars-selector .review-star');
    stars.forEach((star, index) => {
        star.classList.remove('review-star-active', 'review-star-dim', 'review-star-pop');
        if (index < rating) {
            star.classList.add('review-star-active');
            // Staggered pop animation
            setTimeout(() => {
                star.classList.add('review-star-pop');
                setTimeout(() => star.classList.remove('review-star-pop'), 400);
            }, index * 60);
        } else {
            star.classList.add('review-star-dim');
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


