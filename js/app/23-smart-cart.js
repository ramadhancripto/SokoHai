/* ==== js/app/23-smart-cart.js ==== */
import { skh } from './00-bootstrap.js';

// [AUDIT-FIX] lgxEscape ilitumika mara nyingi (soko la logistics) lakini haikufafanuliwa -> ReferenceError.
function lgxEscape(s) {
    s = (s === null || s === undefined) ? '' : String(s);
    if (typeof skh.skhEscape === 'function') return skh.skhEscape(s);
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

window.openPrintingModal = function(){ window.closeModals(); const modal=document.getElementById('printingServiceModal'); if(modal){ modal.style.display='flex'; window.renderPrintingModalPro(); } };

(function injectSmartCartCSS(){
    const css = `
    #cartModal { z-index:100003 !important; }
    .scart-shell { width:96%; max-width:980px; max-height:92vh; background:#fff; border-radius:24px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 70px rgba(15,23,42,.42); }
    .scart-head { background:#F1FBF7; color:#18352D; border-bottom:1px solid #D9EEE5; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .scart-head h2 { margin:0; font-size:18px; }
    .scart-head small { color:#cbd5e1; font-size:13px; }
    .scart-head-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .scart-btn { border:none; border-radius:12px; min-height:39px; padding:9px 12px; font-size:13px; font-weight:950; cursor:pointer; }
    .scart-btn-primary { background:#18A982; color:#fff; }
    .scart-btn-gold { background:#D4AF37; color:#0f172a; }
    .scart-btn-red { background:#e11d48; color:#fff; }
    .scart-btn-light { background:#eef2f7; color:#0f172a; border:1px solid #dbe3ee; }
    .scart-body { display:grid; grid-template-columns:1.7fr .9fr; gap:0; min-height:0; flex:1; background:#f8fafc; }
    .scart-main { padding:14px; overflow-y:auto; min-width:0; }
    .scart-side { padding:14px; border-left:1px solid #e2e8f0; background:#fff; overflow-y:auto; }
    .scart-section { background:white; border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-bottom:12px; box-shadow:0 4px 14px rgba(15,23,42,.04); }
    .scart-section-title { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
    .scart-section-title b { color:#0f172a; font-size:13px; }
    .scart-badge { display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:999px; background:#ecfdf5; color:#047857; font-size:12px; font-weight:950; }
    .scart-item { display:grid; grid-template-columns:82px 1fr auto; gap:12px; padding:12px; border:1px solid #e2e8f0; border-radius:16px; background:#fff; margin-bottom:10px; }
    .scart-item img { width:82px; height:82px; border-radius:13px; object-fit:cover; background:#e2e8f0; }
    .scart-item-title { color:#0f172a; font-size:13px; font-weight:950; margin-bottom:4px; }
    .scart-meta { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0; }
    .scart-meta span { background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; padding:3px 7px; border-radius:999px; font-size:12px; font-weight:850; }
    .scart-qty { display:flex; align-items:center; gap:6px; margin-top:8px; }
    .scart-qty button { width:30px; height:30px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; font-weight:950; cursor:pointer; }
    .scart-qty input { width:48px; text-align:center; border:1px solid #cbd5e1; border-radius:10px; padding:7px; font-weight:900; }
    .scart-item-actions { display:flex; flex-direction:column; gap:7px; min-width:105px; }
    .scart-line { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eef2f7; font-size:12px; color:#334155; }
    .scart-line:last-child { border-bottom:none; }
    .scart-line b { color:#0f172a; }
    .scart-total { background:#EAF8F2; color:#17604E; border:1px solid #CCEBDD; border-radius:18px; padding:14px; text-align:center; margin-bottom:10px; }
    .scart-total small { display:block; color:#65757A; font-size:12.5px; font-weight:950; text-transform:uppercase; }
    .scart-total b { display:block; font-size:26px; margin-top:4px; }
    .scart-field { margin-bottom:10px; }
    .scart-field label { display:block; font-size:12.5px; font-weight:950; color:#64748b; text-transform:uppercase; margin-bottom:5px; }
    .scart-field input,.scart-field select,.scart-field textarea { width:100%; border:1px solid #cbd5e1; border-radius:12px; padding:10px; font-size:12px; outline:none; box-sizing:border-box; background:#fff; }
    .scart-field textarea { min-height:72px; resize:vertical; }
    .scart-chat-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:10px; margin-top:8px; }
    .scart-comment-list { max-height:130px; overflow-y:auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:8px; margin-top:8px; }
    .scart-comment { font-size:13px; padding:7px; border-radius:10px; background:#eef6ff; margin-bottom:6px; color:#0f172a; }
    .scart-mobile-checkout { display:none; position:sticky; bottom:0; background:rgba(255,255,255,.96); border-top:1px solid #e2e8f0; padding:10px; z-index:2; }
    @media(max-width:860px){ .scart-body{grid-template-columns:1fr;} .scart-side{border-left:none;border-top:1px solid #e2e8f0;} .scart-item{grid-template-columns:70px 1fr;} .scart-item img{width:70px;height:70px;} .scart-item-actions{grid-column:1 / -1; flex-direction:row; flex-wrap:wrap;} .scart-mobile-checkout{display:block;} }
    @media(max-width:520px){ .scart-shell{width:98%; max-height:94vh; border-radius:18px;} .scart-head{align-items:flex-start; flex-direction:column;} .scart-head-actions{width:100%;} .scart-head-actions button{flex:1;} .scart-main,.scart-side{padding:10px;} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.smartCartState = window.smartCartState || { shippingMethod:'home_delivery', paymentMethod:'sokopay_wallet', promo:'', discount:0, notes:'', address:'', insurance:0, tax:0, escrowFee:0 };

window.smartCartCalculate = function(){
    const items=skh.smartCartItems();
    const productsTotal=items.reduce((s,x)=>s + skh.smartCartPrice(x)*skh.smartCartQty(x),0);
    const sellers=[...new Set(items.map(skh.smartCartSellerId))];
    const method=window.smartCartState.shippingMethod || document.getElementById('smartShippingMethod')?.value || 'home_delivery';
    let shipping = method==='pickup' ? 0 : method==='express' ? 6000*sellers.length : 3000*sellers.length;
    const insurance = document.getElementById('smartInsurance')?.checked ? Math.round(productsTotal*0.01) : 0;
    const tax = 0;
    const escrowFee = Math.round(productsTotal*0.015);
    const discount = window.smartCartState.discount || 0;
    const grandTotal = Math.max(0, productsTotal + shipping + insurance + tax + escrowFee - discount);
    return { itemsCount:items.reduce((s,x)=>s+skh.smartCartQty(x),0), productsTotal, sellersCount:sellers.length, shipping, insurance, tax, escrowFee, discount, grandTotal };
};

window.renderSmartCart = function(){
    const modal=document.getElementById('cartModal'); if(!modal) return;
    const items=skh.smartCartItems();
    const calc=window.smartCartCalculate();
    const grouped={}; items.forEach((x,i)=>{ const sid=skh.smartCartSellerId(x); grouped[sid]=grouped[sid]||[]; grouped[sid].push({item:x,index:i}); });
    modal.innerHTML = `<div class="scart-shell"><div class="scart-head"><div><h2> My Smart Cart</h2><small>Items: ${calc.itemsCount} • Estimated Total: TZS ${calc.grandTotal.toLocaleString()} • Protected by SokoPay Escrow</small></div><div class="scart-head-actions"><button class="scart-btn scart-btn-light" onclick="window.closeModals()">Continue Shopping</button><button class="scart-btn scart-btn-light" onclick="window.saveCartForLater()">Save for Later</button><button class="scart-btn scart-btn-red" onclick="window.clearSmartCart()">Clear Cart</button></div></div><div class="scart-body"><div class="scart-main">${items.length?Object.entries(grouped).map(([sid,arr])=>window.renderSmartSellerGroup(sid,arr)).join(''):'<div class="scart-section" style="text-align:center;color:#64748b;">Kikapu chako kipo wazi </div>'}<div class="scart-section"><div class="scart-section-title"><b> Shipping</b></div><div class="scart-field"><label>Shipping Address</label><textarea id="smartShippingAddress" placeholder="Mtaa, nyumba, landmark, simu ya mpokeaji..." oninput="window.smartCartState.address=this.value">${skh.skhEscape(window.smartCartState.address||'')}</textarea></div><div class="scart-field"><label>Delivery Method</label><select id="smartShippingMethod" onchange="window.smartCartState.shippingMethod=this.value; window.renderSmartCart();"><option value="pickup" ${window.smartCartState.shippingMethod==='pickup'?'selected':''}>Pickup</option><option value="home_delivery" ${window.smartCartState.shippingMethod==='home_delivery'?'selected':''}>Home Delivery</option><option value="express" ${window.smartCartState.shippingMethod==='express'?'selected':''}>Express</option></select></div></div><div class="scart-section"><div class="scart-section-title"><b> Order Notes</b></div><div class="scart-field"><label>Delivery Instructions / Special Request / Gift Note</label><textarea id="smartOrderNotes" placeholder="Mfano: Nipigie ukifika, usiache kwa jirani..." oninput="window.smartCartState.notes=this.value">${skh.skhEscape(window.smartCartState.notes||'')}</textarea></div></div></div><div class="scart-side">${window.renderSmartCartSummary(calc)}</div></div><div class="scart-mobile-checkout"><button class="scart-btn scart-btn-gold" style="width:100%;" onclick="window.openSmartOrderReview()">Proceed to Checkout • TZS ${calc.grandTotal.toLocaleString()}</button></div></div>`;
};

window.renderSmartSellerGroup = function(sid, arr){
    const sellerName=skh.smartCartSellerName(arr[0].item);
    const subtotal=arr.reduce((s,r)=>s+skh.smartCartPrice(r.item)*skh.smartCartQty(r.item),0);
    return `<div class="scart-section"><div class="scart-section-title"><b> ${skh.skhEscape(sellerName)}</b><span class="scart-badge"> Verified Seller • Escrow</span></div><div style="font-size:13px;color:#64748b;margin-bottom:10px;">Seller ID: ${skh.skhEscape(sid)} • Rating: • Response: ~15 min • Subtotal: TZS ${subtotal.toLocaleString()}</div>${arr.map(r=>window.renderSmartCartItem(r.item,r.index)).join('')}<div class="scart-chat-card"><b style="font-size:12px;color:#0f172a;"> Seller Communication / Comments</b><div class="scart-field" style="margin-top:8px;"><textarea id="sellerMsg_${sid}" placeholder="Muulize seller kuhusu stock, rangi, delivery, warranty..."></textarea></div><button class="scart-btn scart-btn-primary" onclick="window.sendCartSellerMessage('${sid}')">Tuma Ujumbe kwa Seller</button><button class="scart-btn scart-btn-light" style="margin-left:6px;" onclick="window.openCartSellerChat('${sid}')">Fungua Chat</button><div id="sellerComments_${sid}" class="scart-comment-list"><small style="color:#64748b;">Comments/mawasiliano yatarekodiwa hapa.</small></div></div></div>`;
};

window.renderSmartCartItem = function(item,index){
    const qty=skh.smartCartQty(item), price=skh.smartCartPrice(item), subtotal=price*qty;
    return `<div class="scart-item"><img src="${skh.smartCartImg(item)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2282%22 height=%2282%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2224%22%3E%3C/text%3E%3C/svg%3E'"><div><div class="scart-item-title">${skh.skhEscape(item.title||item.name||'Product')}</div><div style="font-size:12px;color:#BC4A3C;font-weight:950;">TSh ${price.toLocaleString()} • Subtotal TSh ${subtotal.toLocaleString()}</div><div class="scart-meta"><span>Seller: ${skh.skhEscape(skh.smartCartSellerName(item))}</span><span>Stock: ${item.stock||item.quantityAvailable||'—'}</span><span>Color: ${item.chosenColor||item.color||'N/A'}</span><span>Size: ${item.chosenSize||item.size||'N/A'}</span><span>Warranty: ${item.warranty||'Seller terms'}</span></div><div class="scart-qty"><button onclick="window.updateSmartCartQty(${index},-1)">−</button><input value="${qty}" onchange="window.setSmartCartQty(${index},this.value)"><button onclick="window.updateSmartCartQty(${index},1)">+</button></div></div><div class="scart-item-actions"><button class="scart-btn scart-btn-light" onclick="window.saveCartItemForLater(${index})">Save Later</button><button class="scart-btn scart-btn-light" onclick="window.moveCartItemToWishlist(${index})">Wishlist</button><button class="scart-btn scart-btn-red" onclick="window.removeSmartCartItem(${index})">Remove</button></div></div>`;
};

window.renderSmartCartSummary = function(calc){
    return `<div class="scart-total"><small>Grand Total</small><b>TSh ${calc.grandTotal.toLocaleString()}</b></div><div class="scart-section"><div class="scart-section-title"><b> Escrow Protection</b><span class="scart-badge">Active</span></div><div style="font-size:12px;color:#64748b;line-height:1.5;">Payment protected. Funds released after buyer confirmation. Dispute available.</div></div><div class="scart-section"><div class="scart-section-title"><b> Discounts</b></div><div class="scart-field"><label>Promo/Voucher/Gift Card/Reward Points</label><input id="smartPromo" placeholder="Weka promo code"><button class="scart-btn scart-btn-primary" style="width:100%;margin-top:8px;" onclick="window.applySmartCartPromo()">Apply</button></div></div><div class="scart-section"><div class="scart-section-title"><b> Payment Method</b></div><select id="smartPaymentMethod" class="scart-input" onchange="window.smartCartState.paymentMethod=this.value"><option value="sokopay_wallet">SokoPay Wallet</option><option value="pesapal">PesaPal</option><option value="mpesa">M-Pesa</option><option value="airtel">Airtel Money</option><option value="tigo">Tigo Pesa</option><option value="halopesa">HaloPesa</option><option value="bank">Bank</option><option value="card">Card</option></select><label style="display:flex;gap:8px;align-items:center;font-size:12px;font-weight:850;margin-top:10px;"><input id="smartInsurance" type="checkbox" onchange="window.renderSmartCart()"> Add insurance</label></div><div class="scart-section"><div class="scart-section-title"><b> Cost Breakdown</b></div><div class="scart-line"><span>Products Total</span><b>TSh ${calc.productsTotal.toLocaleString()}</b></div><div class="scart-line"><span>Shipping</span><b>TSh ${calc.shipping.toLocaleString()}</b></div><div class="scart-line"><span>Insurance</span><b>TSh ${calc.insurance.toLocaleString()}</b></div><div class="scart-line"><span>Tax</span><b>TSh ${calc.tax.toLocaleString()}</b></div><div class="scart-line"><span>Discount</span><b>- TSh ${calc.discount.toLocaleString()}</b></div><div class="scart-line"><span>Escrow Fee</span><b>TSh ${calc.escrowFee.toLocaleString()}</b></div><div class="scart-line"><span>Total</span><b>TSh ${calc.grandTotal.toLocaleString()}</b></div><button class="scart-btn scart-btn-gold" style="width:100%;margin-top:12px;" onclick="window.openSmartOrderReview()">Proceed to Checkout</button></div><div class="scart-section"><div class="scart-section-title"><b> Security Panel</b></div><div class="scart-line"><span>Buyer Verified</span><b></b></div><div class="scart-line"><span>Seller Verified</span><b></b></div><div class="scart-line"><span>Escrow Active</span><b></b></div><div class="scart-line"><span>Token Ready</span><b></b></div></div>`;
};

window.openCart = function(){ if(!skh.requireAuth()) return; closeModals(); const cm=document.getElementById('cartModal'); if(cm){ cm.style.display='flex'; window.renderSmartCart(); } };

window.updateSmartCartQty=(i,d)=>{ skh.myCart[i].qty=skh.smartCartQty(skh.myCart[i])+d; if(skh.myCart[i].qty<1) skh.myCart[i].qty=1; skh.smartCartSave(); window.renderSmartCart(); };

window.setSmartCartQty=(i,v)=>{ skh.myCart[i].qty=Math.max(1,parseInt(v)||1); skh.smartCartSave(); window.renderSmartCart(); };

window.removeSmartCartItem=(i)=>{ skh.myCart.splice(i,1); skh.smartCartSave(); window.renderSmartCart(); };

window.clearSmartCart=async ()=>{ if(await skhConfirm('Futa cart yote?')){ skh.myCart=[]; skh.smartCartSave(); window.renderSmartCart(); } };

window.saveCartForLater=()=>{ skh.localStorage.setItem('sokohai_saved_cart', JSON.stringify(skh.smartCartItems())); alert('Cart saved for later.'); };

window.saveCartItemForLater=(i)=>{ const saved=JSON.parse(skh.localStorage.getItem('sokohai_saved_later')||'[]'); saved.push(skh.myCart[i]); skh.localStorage.setItem('sokohai_saved_later', JSON.stringify(saved)); skh.myCart.splice(i,1); skh.smartCartSave(); window.renderSmartCart(); };

window.moveCartItemToWishlist=(i)=>{ const saved=JSON.parse(skh.localStorage.getItem('sokohai_wishlist')||'[]'); saved.push(skh.myCart[i]); skh.localStorage.setItem('sokohai_wishlist', JSON.stringify(saved)); skh.myCart.splice(i,1); skh.smartCartSave(); window.renderSmartCart(); };

window.applySmartCartPromo=()=>{ const code=document.getElementById('smartPromo')?.value?.trim(); if(!code) return; window.smartCartState.discount = code.toUpperCase()==='SOKOHAI' ? 5000 : 0; alert(window.smartCartState.discount?'Promo applied.':'Promo code haijatambulika.'); window.renderSmartCart(); };

window.sendCartSellerMessage = async function(sellerId){
    const txt=document.getElementById('sellerMsg_'+sellerId)?.value?.trim(); if(!txt) return alert('Andika ujumbe/comment kwanza.');
    const payload={ buyerId:skh.currentUser.uid, buyerName:skh.currentUser.displayName||skh.currentUserData?.fullName||'Buyer', sellerId, text:txt, source:'smart_cart', cartSnapshot:skh.smartCartItems().filter(x=>skh.smartCartSellerId(x)===sellerId).map(x=>({title:x.title||x.name, price:x.price, qty:skh.smartCartQty(x)})), createdAt:new Date().toISOString(), read:false };
    try{ await skh.addDoc(skh.collection(skh.db,'cart_seller_messages'), payload); await skh.addDoc(skh.collection(skh.db,'notifications'), { userId:sellerId, title:' New Cart Message', body:txt, createdAt:new Date().toISOString(), read:false }); }catch(e){ console.log('seller msg save failed',e); }
    const box=document.getElementById('sellerComments_'+sellerId); if(box) box.innerHTML += `<div class="scart-comment"><b>You:</b> ${skh.skhEscape(txt)}</div>`;
    document.getElementById('sellerMsg_'+sellerId).value='';
};

window.openCartSellerChat = function(sellerId){ alert('Seller chat imehifadhiwa kwenye cart_seller_messages. Ujumbe mpya unaweza kuonekana Notification/Chat module.'); };

window.openSmartOrderReview = async function(){
    const calc=window.smartCartCalculate(); if(!skh.smartCartItems().length) return alert('Cart iko wazi.');
    const ok=await skhConfirm(`ORDER REVIEW\nProducts: ${calc.itemsCount}\nSellers: ${calc.sellersCount}\nShipping: TSh ${calc.shipping.toLocaleString()}\nEscrow: Active\nPayment: ${window.smartCartState.paymentMethod}\nTotal: TSh ${calc.grandTotal.toLocaleString()}\n\nConfirm Order?`);
    if(ok) window.confirmSmartCartOrder();
};

window.confirmSmartCartOrder = async function(){
    const items=skh.smartCartItems(); const calc=window.smartCartCalculate(); const token=skh.smartCartToken(); const orderId='ORD-'+Date.now();
    const grouped={}; items.forEach(x=>{ const sid=skh.smartCartSellerId(x); grouped[sid]=grouped[sid]||[]; grouped[sid].push(x); });
    try{
        for(const [sellerId,sellerItems] of Object.entries(grouped)){
            const subtotal=sellerItems.reduce((s,x)=>s+skh.smartCartPrice(x)*skh.smartCartQty(x),0);
            await skh.addDoc(skh.collection(skh.db,'orders'), { orderId, transactionToken:token, buyerId:skh.currentUser.uid, buyerName:skh.currentUser.displayName||skh.currentUserData?.fullName||'Buyer', sellerId, items:sellerItems, itemTitle:`Smart Cart Order (${sellerItems.length} items)`, amount:subtotal, cartTotals:calc, shipping:{ method:window.smartCartState.shippingMethod, address:document.getElementById('smartShippingAddress')?.value || window.smartCartState.address || '' }, orderNotes:document.getElementById('smartOrderNotes')?.value || window.smartCartState.notes || '', paymentMethod:window.smartCartState.paymentMethod, escrow:{ status:'active', protected:true, releaseAfterConfirmation:true, disputeAvailable:true }, status:'payment_pending', tracking:['Payment Received','Seller Preparing','Packed','Shipped','In Transit','Out for Delivery','Delivered','Completed'], createdAt:new Date().toISOString() });
            await skh.addDoc(skh.collection(skh.db,'notifications'), { userId:sellerId, title:' New Smart Cart Order', body:`Order ${orderId} • Token ${token} • TSh ${subtotal.toLocaleString()}`, createdAt:new Date().toISOString(), read:false });
        }
        await skh.addDoc(skh.collection(skh.db,'smart_cart_checkouts'), { orderId, transactionToken:token, buyerId:skh.currentUser.uid, items, totals:calc, paymentMethod:window.smartCartState.paymentMethod, createdAt:new Date().toISOString() });
        alert(` Order created\nOrder ID: ${orderId}\nTransaction Token: ${token}\nProceeding to SokoPay Escrow payment.`);
        sessionStorage.setItem('smart_cart_checkout_token', token); skh.activeCheckoutAmount=calc.grandTotal; document.getElementById('checkoutAmount').value=`TSh ${calc.grandTotal.toLocaleString()}`; skh.myCart=[]; skh.smartCartSave(); closeModals(); document.getElementById('checkoutModal').style.display='flex';
    }catch(e){ alert('Order creation failed: '+e.message); }
};

const _oldAddToCartSmart = window.addToCart;

window.addToCart = async function(isBuyNow=false){
    if(isBuyNow) return _oldAddToCartSmart ? _oldAddToCartSmart(true) : null;
    if(!skh.requireAuth()) return;
    if(!skh.currentOpenProduct) return alert('Bidhaa haijapakia vizuri.');
    const qty=parseInt(document.getElementById('pmQty')?.value || '1') || 1;
    const chosenColor=skh.currentOpenProduct?.selectedVariants?.color || skh.currentOpenProduct?.chosenColor || 'N/A';
    const chosenSize=skh.currentOpenProduct?.selectedVariants?.size || skh.currentOpenProduct?.chosenSize || 'N/A';
    const item={...skh.currentOpenProduct, qty, chosenColor, chosenSize, sellerId:skh.currentOpenProduct.userId||skh.currentOpenProduct.sellerId, sellerName:skh.currentOpenProduct.sellerName||skh.currentOpenProduct.ownerName||'Seller', addedAt:new Date().toISOString(), escrowEligible:true};
    skh.myCart=skh.smartCartItems(); skh.myCart.push(item); skh.smartCartSave();
    const badge=document.getElementById('cartBadge'); if(badge){ badge.style.display='flex'; badge.innerText=skh.myCart.length; }
    alert(' Bidhaa imewekwa kwenye Smart Cart.');
};

(function injectSokoPayBuyerTrackingCSS(){
    const css = `
    .spbuyer-modal-card { width:96%; max-width:980px; max-height:92vh; background:white; border-radius:24px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 72px rgba(15,23,42,.45); }
    .spbuyer-head { background:#F1FBF7; color:#18352D; border-bottom:1px solid #D9EEE5; padding:16px; display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .spbuyer-head h2 { margin:0; font-size:18px; } .spbuyer-head small { color:#cbd5e1; font-size:13px; }
    .spbuyer-body { background:#fff; padding:14px; overflow-y:auto; }
    .spbuyer-tabs { display:flex; gap:7px; overflow-x:auto; margin-bottom:12px; }
    .spbuyer-tab { border:1px solid #dbe3ee; background:white; color:#334155; border-radius:999px; padding:8px 12px; font-size:13px; font-weight:950; white-space:nowrap; cursor:pointer; }
    .spbuyer-tab.active { background:#18A982; color:white; border-color:#18A982; }
    .spbuyer-card { background:white; border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-bottom:12px; box-shadow:0 4px 14px rgba(15,23,42,.04); }
    .spbuyer-order-row { display:grid; grid-template-columns:70px 1fr auto; gap:12px; align-items:center; border:1px solid #e2e8f0; border-radius:16px; padding:10px; background:#fff; margin-bottom:10px; }
    .spbuyer-order-row img { width:70px; height:70px; border-radius:12px; object-fit:cover; background:#e2e8f0; }
    .spbuyer-title { font-size:13px; font-weight:950; color:#0f172a; margin-bottom:4px; }
    .spbuyer-meta { display:flex; flex-wrap:wrap; gap:5px; }
    .spbuyer-pill { display:inline-block; padding:3px 8px; border-radius:999px; background:#eef2f7; color:#334155; border:1px solid #dbe3ee; font-size:12px; font-weight:950; }
    .spbuyer-pill.green { background:#ecfdf5; color:#047857; border-color:#a7f3d0; } .spbuyer-pill.amber { background:#fffbeb; color:#b45309; border-color:#fde68a; } .spbuyer-pill.red { background:#fff5f5; color:#991b1b; border-color:#fecaca; }
    .spbuyer-btn { border:none; border-radius:12px; min-height:38px; padding:8px 11px; font-size:13px; font-weight:950; cursor:pointer; }
    .spbuyer-btn.primary { background:#18A982; color:white; } .spbuyer-btn.green { background:#18A982; color:white; } .spbuyer-btn.red { background:#e11d48; color:white; } .spbuyer-btn.light { background:#eef2f7; color:#0f172a; border:1px solid #dbe3ee; }
    .spbuyer-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
    .spbuyer-stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:10px; text-align:center; }
    .spbuyer-stat small { display:block; color:#64748b; font-size:12px; font-weight:950; text-transform:uppercase; } .spbuyer-stat b { display:block; color:#0f172a; font-size:12px; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .spbuyer-timeline { border-left:3px solid #00509d; margin-left:10px; padding-left:14px; }
    .spbuyer-time-item { position:relative; background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:10px; margin-bottom:9px; }
    .spbuyer-time-item::before { content:''; position:absolute; left:-23px; top:14px; width:12px; height:12px; background:#18A982; border:2px solid #fff; border-radius:50%; }
    .spbuyer-doc-grid,.spbuyer-action-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; }
    @media(max-width:760px){ .spbuyer-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .spbuyer-order-row{grid-template-columns:56px 1fr;} .spbuyer-order-row img{width:56px;height:56px;} .spbuyer-order-row>div:last-child{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.sokopayStatusGroups = ['All','Pending','Confirmed','Preparing','Packed','Collected','In Transit','Nearby','Delivered','Completed','Disputed'];

window.hydrateSmartCartProducts = async function(){
    const items=skh.smartCartItems ? skh.smartCartItems() : (JSON.parse(skh.localStorage.getItem('sokohai_cart')||'[]'));
    let changed=false;
    for(let i=0;i<items.length;i++){
        const id=items[i].id || items[i].productId;
        if(!id) continue;
        try{
            const snap=await skh.getDoc(skh.doc(skh.db,'products',id));
            if(snap.exists()){
                const p=snap.data();
                items[i]={...items[i], productId:id, title:p.title||p.name||items[i].title, price:p.price ?? items[i].price, image:p.image||p.images?.[0]||items[i].image, stock:p.stock ?? p.quantity ?? items[i].stock, sellerId:p.userId||p.sellerId||items[i].sellerId, sellerName:p.ownerName||p.sellerName||items[i].sellerName, sellerLocation:p.location||items[i].sellerLocation, productLiveLinked:true, productUpdatedAt:p.updatedAt||''};
                changed=true;
            }
        }catch(e){ console.log('hydrate product skipped', id, e.message); }
    }
    if(changed){ skh.myCart=items; skh.localStorage.setItem('sokohai_cart',JSON.stringify(items)); }
    return items;
};

const _oldOpenCartHydrate = window.openCart;

window.openCart = async function(){
    if(!skh.requireAuth()) return;
    await window.hydrateSmartCartProducts();
    closeModals(); const cm=document.getElementById('cartModal'); if(cm){ cm.style.display='flex'; window.renderSmartCart(); }
};

const _oldProcessPaymentSokoPayCore = window.processPayment;

window.processPayment = async function(){
    const provider=document.getElementById('checkoutProvider')?.value || document.getElementById('hiddenProvider')?.value || '';
    const r = _oldProcessPaymentSokoPayCore ? await _oldProcessPaymentSokoPayCore() : null;
    /* [AUDIT-FIX 2026-09-16 P0 §42] IMEONDOLEWA:
         await skh.updatePendingSokoPayAfterPayment('PAY-'+Date.now(), provider);
       Ilikuwa ikiandika 'Payment Protected / Money Secured' mara moja baada ya
       kuanzisha checkout — HATA kabla malipo hayajathibitishwa na server, na kwa
       reference ya uongo ('PAY-'+Date.now()). Huu ni "fake payment success"
       uliopigwa marufuku (§23, §42). Uthibitishaji halisi unafanyika baada ya
       kurudi kutoka PesaPal kupitia js/17-pesapal-return.js (server-verified). */
    return r;
};

window.ensureSokoPayBuyerOrdersModal = function(){
    let m=document.getElementById('sokopayBuyerOrdersModal');
    if(m) return m;
    m=document.createElement('div'); m.id='sokopayBuyerOrdersModal'; m.className='overlay-menu'; m.style.cssText='z-index:100007;display:none;background:rgba(15,23,42,.55);';
    document.body.appendChild(m); return m;
};

window.openSokoPayBuyerOrders = function(filter='All'){
    if(!skh.currentUser) return window.openAuthModal?.();
    const m=window.ensureSokoPayBuyerOrdersModal();
    m.innerHTML=`<div class="spbuyer-modal-card"><div class="spbuyer-head"><div><h2> SokoPay • My Orders</h2><small>Payment • Escrow • Shipment • Tokens • Contracts • Documents</small></div><button class="spbuyer-btn light" onclick="window.openBuyerOrdersModal && window.openBuyerOrdersModal()" title="Rudi kwenye Oda na Safari Zangu"> Oda &amp; Safari</button><button class="spbuyer-btn light" onclick="document.getElementById('sokopayBuyerOrdersModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="spbuyer-body"><div class="spbuyer-tabs">${window.sokopayStatusGroups.map(x=>`<button class="spbuyer-tab ${x===filter?'active':''}" onclick="window.openSokoPayBuyerOrders('${x}')">${x}</button>`).join('')}</div><div id="spbuyerOrdersList"><p style="text-align:center;color:#64748b;">Inapakia orders...</p></div></div></div>`;
    m.style.display='flex';
    window.loadSokoPayBuyerOrders(filter);
};

window.loadSokoPayBuyerOrders = function(filter='All'){
    const box=document.getElementById('spbuyerOrdersList'); if(!box) return;
    try{
        const qTx=skh.query(skh.collection(skh.db,'sokopay_core_transactions'), skh.where('buyerId','==',skh.currentUser.uid), skh.orderBy('createdAt','desc'), skh.limit(50));
        window.skhOnSnapshot('sokopay-tx', qTx, snap=>{
            if(snap.empty){ box.innerHTML='<div class="spbuyer-card" style="text-align:center;color:#64748b;">Huna SokoPay orders bado.</div>'; return; }
            box.innerHTML='';
            snap.forEach(d=>{ const tx={ id:d.id, ...d.data() }; if(filter!=='All' && !String(tx.orderStatus||'').toLowerCase().includes(filter.toLowerCase()) && !String(tx.shipmentStatus||'').toLowerCase().includes(filter.toLowerCase())) return; box.innerHTML += window.renderSokoPayBuyerOrderRow(tx); });
        });
    }catch(e){ box.innerHTML='<p style="color:#e11d48;">Imeshindikana kupakia orders: '+e.message+'</p>'; }
};

window.renderSokoPayBuyerOrderRow = function(tx){
    const first=tx.items?.[0] || {}; const img=skh.smartCartImg(first);
    return `<div class="spbuyer-order-row"><img src="${skh.skhEscape(img)}" onerror="this.style.display='none'"><div><div class="spbuyer-title">${skh.skhEscape(first.title||first.name||tx.orderId)}</div><div style="font-size:12px;color:#64748b;">Seller: ${skh.skhEscape(tx.sellerDetails?.businessName||tx.sellerName||tx.sellerId)} • TSh ${(tx.amount||0).toLocaleString()}</div><div class="spbuyer-meta"><span class="spbuyer-pill ${skh.spStatusClass(tx.paymentStatus)}">${tx.paymentStatus}</span><span class="spbuyer-pill ${skh.spStatusClass(tx.escrowStatus)}">${tx.escrowStatus}</span><span class="spbuyer-pill ${skh.spStatusClass(tx.shipmentStatus)}">${tx.shipmentStatus}</span></div></div><div><button class="spbuyer-btn primary" onclick="window.openSokoPayOrderDetail('${tx.id}')">Open</button></div></div>`;
};

window.openSokoPayOrderDetail = async function(id){
    const snap=await skh.getDoc(skh.doc(skh.db,'sokopay_core_transactions',id)); if(!snap.exists()) return alert('Order haijapatikana.');
    const tx={ id, ...snap.data() };
    const m=window.ensureSokoPayBuyerOrdersModal();
    m.innerHTML=`<div class="spbuyer-modal-card"><div class="spbuyer-head"><div><h2> ${tx.orderId}</h2><small>Token: ${tx.transactionToken}</small></div><button class="spbuyer-btn light" onclick="window.openSokoPayBuyerOrders()"><- Orders</button></div><div class="spbuyer-body"><div class="spbuyer-card"><div class="spbuyer-grid"><div class="spbuyer-stat"><small>Payment</small><b>${tx.paymentStatus}</b></div><div class="spbuyer-stat"><small>Escrow</small><b>${tx.escrowStatus}</b></div><div class="spbuyer-stat"><small>Shipment</small><b>${tx.shipmentStatus}</b></div><div class="spbuyer-stat"><small>Contract</small><b>${tx.contractStatus}</b></div></div></div><div class="spbuyer-card"><b> Tokens</b><div class="spbuyer-grid" style="margin-top:10px;"><div class="spbuyer-stat"><small>Payment Token</small><b>${tx.paymentToken}</b></div><div class="spbuyer-stat"><small>Shipment Token</small><b>${tx.shipmentToken}</b></div><div class="spbuyer-stat"><small>Escrow Token</small><b>${tx.escrowToken}</b></div><div class="spbuyer-stat"><small>Verification Token</small><b>${tx.verificationToken}</b></div></div></div><div class="spbuyer-card"><b> Live Tracking</b><div class="spbuyer-grid" style="margin-top:10px;"><div class="spbuyer-stat"><small>Courier</small><b>${skh.skhEscape(tx.courier?.name||'Not assigned')}</b></div><div class="spbuyer-stat"><small>Phone</small><b>${skh.skhEscape(tx.courier?.phone||'—')}</b></div><div class="spbuyer-stat"><small>ETA</small><b>${tx.courier?.eta||'—'}</b></div><div class="spbuyer-stat"><small>Distance</small><b>${tx.courier?.distance||'—'}</b></div></div></div><div class="spbuyer-card"><b> Seller Details</b><p style="font-size:12px;color:#64748b;line-height:1.5;">Verified: ${tx.sellerVerified?'Yes':'Pending/Outside Seller'} • Rating: ${tx.sellerDetails?.rating||'—'} • Business: ${skh.skhJsEsc(tx.sellerDetails?.businessName||tx.sellerName)} • Support: ${skh.skhEscape(tx.sellerDetails?.supportContact||'—')}${tx.outsideSeller?'<br><b>Outside Seller:</b> updates via Secure Seller Portal / Generated Seller Link.':''}</p></div><div class="spbuyer-card"><b> Documents</b><div class="spbuyer-doc-grid" style="margin-top:10px;">${['Receipt','Invoice','Delivery Note','Warranty','Contract'].map(docu=>`<button class="spbuyer-btn light" onclick="window.downloadSokoPayDocument('${docu}','${tx.id}')">${docu}</button>`).join('')}</div></div><div class="spbuyer-card"><b> History</b><div class="spbuyer-timeline">${(tx.timeline||[]).map(t=>`<div class="spbuyer-time-item"><b>${skh.skhEscape(t.title||'')}</b><br><span style="font-size:12px;color:#64748b;">${skh.skhEscape(t.description||'')}</span><br><small>${t.at?new Date(t.at).toLocaleString():'Pending'}</small></div>`).join('')}</div></div><div class="spbuyer-card"><b>Actions</b><div class="spbuyer-action-grid" style="margin-top:10px;"><button class="spbuyer-btn primary" onclick="alert('Live tracking map itaunganishwa na courier location.')">Track</button><button class="spbuyer-btn light" onclick="window.contactSokoPaySeller('${tx.id}')">Contact Seller</button><button class="spbuyer-btn light" onclick="window.contactSokoPayCourier('${tx.id}')">Contact Courier</button><button class="spbuyer-btn red" onclick="window.raiseSokoPayDispute('${tx.id}')">Raise Dispute</button><button class="spbuyer-btn green" onclick="window.confirmSokoPayDelivery('${tx.id}')">Confirm Delivery</button></div></div></div></div>`;
    m.style.display='flex';
};

window.downloadSokoPayDocument = async function(type,id){ const snap=await skh.getDoc(skh.doc(skh.db,'sokopay_core_transactions',id)); if(!snap.exists()) return; const tx={id,...snap.data()}; skh.spDownloadText(`${type}_${tx.orderId}.txt`, skh.spDocText(type,tx)); };

window.contactSokoPaySeller = async id => { const snap=await skh.getDoc(skh.doc(skh.db,'sokopay_core_transactions',id)); const tx=snap.data(); alert(`Seller Support: ${tx.sellerDetails?.supportContact || 'Contact kupitia SokoPay Support'}\nSeller Portal: ${tx.sellerPortalLink || 'N/A'}`); };

window.contactSokoPayCourier = async id => { const tx=(await skh.getDoc(skh.doc(skh.db,'sokopay_core_transactions',id))).data(); alert(`Courier: ${tx.courier?.name || 'Not assigned'}\nPhone: ${tx.courier?.phone || '—'}`); };

window.raiseSokoPayDispute = async id => { const reason=await skhPrompt('Eleza tatizo/dispute:'); if(!reason) return; await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',id), { orderStatus:'Disputed', contractStatus:'Dispute Active', dispute:{ reason, at:new Date().toISOString(), by:skh.currentUser.uid }, updatedAt:new Date().toISOString() }); alert('Dispute imefunguliwa SokoPay.'); window.openSokoPayOrderDetail(id); };

window.confirmSokoPayDelivery = async id => { if(!await skhConfirm('Thibitisha umepokea bidhaa/huduma? Fedha zinaweza kuachiwa kwa seller.')) return; await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',id), { shipmentStatus:'Delivered', escrowStatus:'Released', paymentStatus:'Released', orderStatus:'Completed', contractStatus:'Completed', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({ title:'Buyer Confirmed Delivery', description:'Buyer confirmed delivery; escrow released.', at:new Date().toISOString(), done:true }) }); alert('Delivery confirmed. Escrow released.'); window.openSokoPayOrderDetail(id); };

window.openBuyerOrdersModal = function() {
    // [PHASE 5.2-UX] Ufuatiliaji wa VITENGO VYOTE: fungua tracker kamili
    // (orders: bidhaa/huduma + ride_requests: usafirishaji — na escrow actions).
    // SokoPay Escrow (sokopay_core_transactions) inafikiwa kwa kitufe ndani ya modal hii.
    if (!skh.currentUser) { if (window.openAuthModal) window.openAuthModal(); return; }
    const om = document.getElementById('buyerOrdersModal');
    if (!om || typeof window.loadBuyerOrdersWithTracking !== 'function') {
        // fallback: tumia SokoPay orders (tabia ya hivi karibuni)
        window.openSokoPayBuyerOrders();
        return;
    }
    if (window.closeModals) window.closeModals();
    om.style.display = 'flex';
    window.loadBuyerOrdersWithTracking();
};

(function injectOrderOrchestrationCSS(){
    const css = `
    .orch-card { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-bottom:12px; box-shadow:0 4px 14px rgba(15,23,42,.04); }
    .orch-title { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
    .orch-title b { color:#0f172a; font-size:13px; }
    .orch-package-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:10px; }
    .orch-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:13px; padding:9px; text-align:center; }
    .orch-box small { display:block; color:#64748b; font-size:12px; font-weight:950; text-transform:uppercase; }
    .orch-box b { display:block; color:#0f172a; font-size:13px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .orch-service-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin:10px 0; }
    .orch-service-tabs button { min-height:42px; border:1px solid #dbe3ee; background:#fff; color:#0f172a; border-radius:12px; font-size:12.5px; font-weight:950; cursor:pointer; }
    .orch-service-tabs button.active { background:#18A982; color:#fff; border-color:#18A982; }
    .orch-carrier { border:1px solid #e2e8f0; border-radius:16px; padding:12px; background:#fff; margin-bottom:8px; display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; }
    .orch-carrier.selected { border-color:#18A982; box-shadow:0 0 0 3px rgba(0,80,157,.10); background:#eff6ff; }
    .orch-carrier b { color:#0f172a; font-size:13px; }
    .orch-carrier small { color:#64748b; font-size:12.5px; line-height:1.45; display:block; margin-top:3px; }
    .orch-carrier-meta { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
    .orch-chip { padding:3px 7px; border-radius:999px; background:#f1f5f9; border:1px solid #e2e8f0; color:#334155; font-size:12px; font-weight:900; }
    .orch-select-btn { min-height:36px; border:none; border-radius:11px; padding:8px 10px; background:#18A982; color:white; font-size:12.5px; font-weight:950; cursor:pointer; }
    .orch-note { background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:10px; border-radius:13px; font-size:13px; line-height:1.45; }
    @media(max-width:760px){ .orch-package-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .orch-service-tabs{grid-template-columns:repeat(2,minmax(0,1fr));} .orch-carrier{grid-template-columns:1fr;} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.sokohaiShippingServices = ['seller_delivery','sokohai_logistics','third_party_courier','customer_pickup'];

window.sokohaiCarrierFallbacks = [
    { id:'moto_delivery', name:'Moto Delivery', company:'SokoHai Logistics', service:'sokohai_logistics', eta:'2 Hours', vehicleType:'Motorcycle', vehicle:'Motorcycle', capacityKg:25, capacity:'25 kg', price:6000, insurance:true, verified:true, rating:4.6, driverName:'Auto assign', driverPhone:'Hidden until assigned', plate:'After assignment', suitableFor:['small','express'], source:'fallback' },
    { id:'fast_express_van', name:'Fast Express', company:'SokoHai Logistics', service:'sokohai_logistics', eta:'1 Day', vehicleType:'Van', vehicle:'Van', capacityKg:2000, capacity:'2 Tons', price:15000, insurance:true, verified:true, rating:4.7, driverName:'Auto assign', driverPhone:'Hidden until assigned', plate:'After assignment', suitableFor:['medium','fragile'], source:'fallback' },
    { id:'seller_delivery_std', name:'Seller Delivery', company:'Seller', service:'seller_delivery', eta:'1-3 Days', vehicleType:'Seller arranged', vehicle:'Seller arranged', capacityKg:100, capacity:'Seller policy', price:3000, insurance:false, verified:false, rating:'—', driverName:'Seller assigns', driverPhone:'Seller contact', plate:'N/A', suitableFor:['small','medium'], source:'fallback' },
    { id:'third_party_courier', name:'Third Party Courier', company:'External Courier', service:'third_party_courier', eta:'1-2 Days', vehicleType:'Courier vehicle', vehicle:'Courier', capacityKg:500, capacity:'500 kg', price:12000, insurance:true, verified:true, rating:4.2, driverName:'After booking', driverPhone:'After booking', plate:'After booking', suitableFor:['medium'], source:'fallback' },
    { id:'customer_pickup', name:'Customer Pickup', company:'Buyer', service:'customer_pickup', eta:'Buyer schedule', vehicleType:'Self pickup', vehicle:'Self pickup', capacityKg:999999, capacity:'N/A', price:0, insurance:false, verified:true, rating:'N/A', driverName:'Buyer', driverPhone:'Buyer', plate:'N/A', suitableFor:['all'], source:'fallback' }
];

window.loadSokoHaiCarriers = async function(){
    let carriers=[...window.sokohaiCarrierFallbacks];
    try{
        const qCar=skh.query(skh.collection(skh.db,'transport_profiles'), skh.limit(30));
        const snap=await skh.getDocs(qCar);
        snap.forEach(d=>{ const x=d.data(); carriers.push({ id:d.id, name:x.name||x.companyName||'Transporter', company:x.companyName||x.name||'Transport', service:x.service||'sokohai_logistics', eta:x.eta||'Same/Next Day', vehicleType:x.vehicleType||'Vehicle', vehicle:x.vehicle||x.vehicleType||'Vehicle', capacityKg:skh.orchNum(x.capacityKg||x.capacity,100), capacity:x.capacityLabel||`${x.capacityKg||x.capacity||100} kg`, price:skh.orchNum(x.price||x.basePrice,10000), insurance:!!x.insurance, verified:!!x.verified, rating:x.rating||'—', driverName:x.driverName||'After assignment', driverPhone:x.phone||x.driverPhone||'After assignment', plate:x.plate||x.vehiclePlate||'After assignment', suitableFor:x.suitableFor||['small','medium'], source:'transport_profiles' }); });
    }catch(e){ console.log('transport profiles fallback used', e.message); }
    return carriers;
};

window.selectSmartShippingService = async function(service){
    window.smartCartState.shippingService = service;
    window.smartCartState.selectedCarrier = null;
    await window.renderSmartCartShippingOrchestration(true);
    window.renderSmartCart();
};

window.selectSmartCarrier = function(carrierId){
    const c=(window.smartCartState.availableCarriers||[]).find(x=>x.id===carrierId);
    if(!c) return;
    window.smartCartState.selectedCarrier = c;
    window.smartCartState.shippingMethod = c.service === 'customer_pickup' ? 'pickup' : c.service;
    window.smartCartState.shippingCost = c.price || 0;
    window.renderSmartCart();
};

const _smartCalcOrchOld = window.smartCartCalculate;

window.smartCartCalculate = function(){
    const base = _smartCalcOrchOld ? _smartCalcOrchOld() : { productsTotal:0, sellersCount:0, insurance:0, tax:0, escrowFee:0, discount:0 };
    const selected = window.smartCartState.selectedCarrier;
    const shipping = selected ? skh.orchNum(selected.price,0) : (base.shipping || 0);
    const grandTotal = Math.max(0, base.productsTotal + shipping + (base.insurance||0) + (base.tax||0) + (base.escrowFee||0) - (base.discount||0));
    return { ...base, shipping, grandTotal, package:skh.orchPackageSummary() };
};

window.renderSmartCartShippingOrchestration = async function(skipRender=false){
    const host=document.getElementById('smartShippingOrchestrationHost'); if(!host) return;
    const pkg=skh.orchPackageSummary();
    const service=window.smartCartState.shippingService || 'sokohai_logistics';
    const carriers=await window.loadSokoHaiCarriers();
    const suitable=carriers.filter(c=>skh.orchCarrierSuitable(c,pkg,service)).sort((a,b)=>a.price-b.price);
    window.smartCartState.availableCarriers=suitable;
    if(!window.smartCartState.selectedCarrier && suitable.length) window.smartCartState.selectedCarrier=suitable[0];
    host.innerHTML = `<div class="orch-card"><div class="orch-title"><b> Shipping & Delivery Orchestration</b><span class="scart-badge">Shipment Token Ready</span></div><div class="orch-package-grid"><div class="orch-box"><small>Weight</small><b>${pkg.weightKg} kg</b></div><div class="orch-box"><small>Volume</small><b>${pkg.volumeCm3.toLocaleString()} cm³</b></div><div class="orch-box"><small>Fragile</small><b>${pkg.fragile?'Yes':'No'}</b></div><div class="orch-box"><small>Sellers</small><b>${pkg.sellersCount}</b></div></div><div class="orch-service-tabs">${window.sokohaiShippingServices.map(s=>`<button class="${service===s?'active':''}" onclick="window.selectSmartShippingService('${s}')">${s==='seller_delivery'?'Seller Delivery':s==='sokohai_logistics'?'SokoHai Logistics':s==='third_party_courier'?'3rd Party':'Pickup'}</button>`).join('')}</div><div class="orch-note">Cart imehesabu uzito, vipimo, fragile/hazardous flags na mahitaji ya shipping kabla ya checkout.</div><div style="margin-top:10px;">${suitable.length?suitable.map(c=>`<div class="orch-carrier ${window.smartCartState.selectedCarrier?.id===c.id?'selected':''}"><div><b>${c.name}</b><small>${c.company} • ETA: ${c.eta} • Vehicle: ${c.vehicleType} • Capacity: ${c.capacity}</small><div class="orch-carrier-meta"><span class="orch-chip">TSh ${Number(c.price||0).toLocaleString()}</span><span class="orch-chip">Insurance: ${c.insurance?'Yes':'No'}</span><span class="orch-chip">Verified: ${c.verified?'':'Pending'}</span><span class="orch-chip">Rating: ${c.rating}</span><span class="orch-chip">Plate: ${c.plate}</span></div></div><button class="orch-select-btn" onclick="window.selectSmartCarrier('${c.id}')">Select</button></div>`).join(''):'<div class="orch-note">Hakuna carrier anaye-fit package hii. Chagua pickup au punguza mzigo.</div>'}</div></div>`;
};

const _renderSmartCartOrchOld = window.renderSmartCart;

window.renderSmartCart = function(){
    if(_renderSmartCartOrchOld) _renderSmartCartOrchOld();
    const main=document.querySelector('#cartModal .scart-main');
    if(main && !document.getElementById('smartShippingOrchestrationHost')){
        const host=document.createElement('div'); host.id='smartShippingOrchestrationHost';
        const shippingSection=[...main.querySelectorAll('.scart-section')].find(s=>/shipping/i.test(s.textContent||''));
        if(shippingSection) main.insertBefore(host, shippingSection); else main.appendChild(host);
    }
    window.renderSmartCartShippingOrchestration();
};

const _orchAddToCartOld = window.addToCart;

window.addToCart = async function(isBuyNow=false){
    if(isBuyNow) return _orchAddToCartOld ? _orchAddToCartOld(true) : null;
    if(!skh.requireAuth()) return;
    if(!skh.currentOpenProduct) return alert('Bidhaa haijapakia vizuri.');
    const qty=parseInt(document.getElementById('pmQty')?.value || '1') || 1;
    const chosenColor=skh.currentOpenProduct?.selectedVariants?.color || skh.currentOpenProduct?.chosenColor || 'N/A';
    const chosenSize=skh.currentOpenProduct?.selectedVariants?.size || skh.currentOpenProduct?.chosenSize || 'N/A';
    let liveProduct={...skh.currentOpenProduct};
    try{ const snap=await skh.getDoc(skh.doc(skh.db,'products', skh.currentOpenProduct.id)); if(snap.exists()) liveProduct={...liveProduct,...snap.data(),id:skh.currentOpenProduct.id}; }catch(e){}
    const cartMeta=skh.orchProductMeta(liveProduct);
    const item={...liveProduct, qty, chosenColor, chosenSize, sellerId:cartMeta.sellerId, sellerName:cartMeta.sellerName, storeName:cartMeta.storeName, cartMeta, escrowEligible:true, addedAt:new Date().toISOString(), orchestrationReady:true};
    skh.myCart=skh.smartCartItems(); skh.myCart.push(item); skh.smartCartSave();
    const badge=document.getElementById('cartBadge'); if(badge){ badge.style.display='flex'; badge.innerText=skh.myCart.length; }
    alert(' Bidhaa imewekwa kwenye SokoCart na taarifa kamili za shipping/escrow.');
};

window.confirmSmartCartOrder = async function(){
    await window.hydrateSmartCartProducts?.();
    const items=skh.smartCartItems(); const calc=window.smartCartCalculate(); if(!items.length) return alert('Cart iko wazi.');
    const carrier=window.smartCartState.selectedCarrier; if(!carrier) return alert('Chagua shipping/courier kabla ya checkout.');
    const transactionToken=skh.smartCartToken(); const orderId='ORD-'+Date.now(); const grouped={}; items.forEach(x=>{ const sid=skh.smartCartSellerId(x); grouped[sid]=grouped[sid]||[]; grouped[sid].push(x); });
    const createdTxIds=[];
    try{
        for(const [sellerId,sellerItems] of Object.entries(grouped)){
            let sellerProfile=null; try{ const s=await skh.getDoc(skh.doc(skh.db,'users',sellerId)); if(s.exists()) sellerProfile=s.data(); }catch(e){}
            let core=skh.buildSokoPayCoreTx({ orderId, transactionToken, sellerId, sellerItems, calc, sellerProfile });
            core.shippingService=carrier.service; core.selectedCarrier=carrier; core.shippingCost=carrier.price||calc.shipping; core.package=calc.package; core.escrowBreakdown={ productCost:core.amount, shippingCost:core.shippingCost, escrowTotal:core.amount+core.shippingCost, escrowFee:calc.escrowFee };
            const coreRef=await skh.addDoc(skh.collection(skh.db,'sokopay_core_transactions'), core); core.sokopayCoreId=coreRef.id; createdTxIds.push(coreRef.id);
            const shipment=skh.orchBuildShipment(core, carrier, calc);
            const shipRef=await skh.addDoc(skh.collection(skh.db,'shipments'), shipment);
            await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreRef.id), { shipmentId:shipment.shipmentId, trackingId:shipment.trackingId, shipmentDocId:shipRef.id, shipmentStatus:'Courier Assigned', updatedAt:new Date().toISOString() });
            await skh.addDoc(skh.collection(skh.db,'logistics_assignments'), { ...shipment, shipmentDocId:shipRef.id, assignmentStatus:'new_assignment', logisticsDashboardStatus:'pending_acceptance' });
            await skh.addDoc(skh.collection(skh.db,'seller_order_inbox'), { sellerId, orderId, transactionToken, sokopayCoreId:coreRef.id, shipmentDocId:shipRef.id, buyerDetails:{ buyerId:core.buyerId, buyerName:core.buyerName }, paymentStatus:core.paymentStatus, escrowStatus:core.escrowStatus, selectedShippingCompany:carrier.company, shippingInstructions:shipment.specialInstructions, pickupAddress:shipment.pickupLocation, deliveryAddress:shipment.deliveryAddress, items:sellerItems, createdAt:new Date().toISOString(), status:'new_order' });
            await skh.addDoc(skh.collection(skh.db,'orders'), { ...core, sokopayCoreId:coreRef.id, shipmentDocId:shipRef.id, status:'payment_pending', itemTitle:`Smart Cart Order (${sellerItems.length} items)`, shipping:{ method:carrier.service, carrier, shipment }, orderNotes:shipment.specialInstructions, paymentMethod:window.smartCartState.paymentMethod });
            await skh.addDoc(skh.collection(skh.db,'notifications'), { userId:core.outsideSeller?'platform_admin':sellerId, title:' New SokoCart Order', body:`${orderId} • ${transactionToken} • ${carrier.name} • TSh ${(core.amount+core.shippingCost).toLocaleString()}`, createdAt:new Date().toISOString(), read:false, sellerPortalToken:core.sellerPortalToken });
        }
        await skh.addDoc(skh.collection(skh.db,'smart_cart_checkouts'), { orderId, transactionToken, buyerId:skh.currentUser.uid, sokopayCoreIds:createdTxIds, items, totals:calc, selectedCarrier:carrier, package:calc.package, paymentMethod:window.smartCartState.paymentMethod, createdAt:new Date().toISOString() });
        sessionStorage.setItem('pending_sokopay_core_ids', JSON.stringify(createdTxIds)); sessionStorage.setItem('smart_cart_checkout_token', transactionToken);
        alert(` Package kamili imetumwa SokoPay Core\nOrder: ${orderId}\nToken: ${transactionToken}\nShipping: ${carrier.name}\nEscrow Total: TSh ${calc.grandTotal.toLocaleString()}`);
        skh.activeCheckoutAmount=calc.grandTotal; document.getElementById('checkoutAmount').value=`TSh ${calc.grandTotal.toLocaleString()}`; skh.myCart=[]; skh.smartCartSave(); closeModals(); document.getElementById('checkoutModal').style.display='flex';
    }catch(e){ alert('Order orchestration failed: '+e.message); }
};

window.openOutsideSellerPortal = function(){
    let m=document.getElementById('outsideSellerPortalModal');
    if(!m){ m=document.createElement('div'); m.id='outsideSellerPortalModal'; m.className='overlay-menu'; m.style.cssText='z-index:100008;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    m.innerHTML=`<div class="spbuyer-modal-card"><div class="spbuyer-head"><div><h2> Outside Seller Portal</h2><small>Create transaction using the same SokoPay Core Engine</small></div><button class="spbuyer-btn light" onclick="document.getElementById('outsideSellerPortalModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="spbuyer-body"><div class="spbuyer-card"><div class="scart-field"><label>Product / Service</label><input id="outProduct" placeholder="Mfano: TV Samsung 43 inch"></div><div class="scart-field"><label>Amount (TZS)</label><input id="outAmount" type="number" placeholder="120000"></div><div class="scart-field"><label>Seller Phone / Contact</label><input id="outSellerPhone" placeholder="07XXXXXXXX"></div><button class="spbuyer-btn primary" onclick="window.createOutsideSellerTransaction()">Generate SokoPay Token</button></div><div id="outsideSellerResult"></div></div></div>`;
    m.style.display='flex';
};

window.createOutsideSellerTransaction = async function(){
    const product=document.getElementById('outProduct')?.value?.trim(); const amount=skh.orchNum(document.getElementById('outAmount')?.value,0); const phone=document.getElementById('outSellerPhone')?.value?.trim();
    if(!product||amount<=0) return alert('Jaza product na amount.');
    const orderId='OUT-'+Date.now(); const transactionToken='SPT-'+Math.random().toString(36).slice(2,10).toUpperCase(); const sellerPortalToken='SEL-'+Math.random().toString(36).slice(2,10).toUpperCase();
    const tx={ orderId, transactionToken, paymentToken:'PAY-'+orderId, shipmentToken:'SHP-'+orderId, escrowToken:'ESC-'+orderId, verificationToken:'VER-'+orderId, buyerId:skh.currentUser?.uid||'external_buyer', buyerName:skh.currentUser?.displayName||'Buyer', sellerId:'outside_seller_'+sellerPortalToken, sellerName:'Outside Seller', outsideSeller:true, sellerPortalToken, sellerPortalLink:`sokohai://seller-portal/${sellerPortalToken}`, sellerDetails:{ supportContact:phone, businessName:'Outside Seller' }, items:[{ title:product, price:amount, qty:1, outsideSeller:true, sellerPhone:phone }], amount, totals:{ grandTotal:amount }, paymentStatus:'Payment Pending', escrowStatus:'Waiting Payment', shipmentStatus:'Waiting Shipment', contractStatus:'Contract Active', orderStatus:'Pending', tokenStatus:'Tokens Ready', timeline:skh.spTimelineBase().map((x,i)=>({title:x[0],description:x[1],at:i===0?new Date().toISOString():null,done:i===0})), createdAt:new Date().toISOString(), source:'outside_seller_portal' };
    const ref=await skh.addDoc(skh.collection(skh.db,'sokopay_core_transactions'), tx);
    document.getElementById('outsideSellerResult').innerHTML=`<div class="spbuyer-card"><b> Token Generated</b><p>Transaction Token: <b>${transactionToken}</b><br>Seller Portal Token: <b>${sellerPortalToken}</b></p><button class="spbuyer-btn primary" onclick="window.skhCopyText('${transactionToken}')">Copy Token</button><button class="spbuyer-btn light" onclick="window.openSokoPayOrderDetail('${ref.id}')">Open Buyer View</button></div>`;
};

(function injectLogisticsMarketplaceCSS(){
    const css = `
    #logisticsMarketplaceModal { z-index:100009 !important; }
    .lgx-shell { width:96%; max-width:1050px; max-height:92vh; background:#fff; border-radius:24px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 74px rgba(15,23,42,.45); }
    .lgx-head { background:#F0F7FA; color:#18352D; border-bottom:1px solid #D6E8EF; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .lgx-head h2 { margin:0; font-size:18px; } .lgx-head small { color:#ccfbf1; font-size:13px; }
    .lgx-body { background:#fff; padding:14px; overflow-y:auto; }
    .lgx-toolbar { display:grid; grid-template-columns:1.2fr .8fr .8fr auto; gap:8px; margin-bottom:12px; }
    .lgx-toolbar input,.lgx-toolbar select { border:1px solid #cbd5e1; border-radius:12px; padding:11px; font-size:12px; outline:none; background:white; }
    .lgx-btn { border:none; border-radius:12px; min-height:40px; padding:9px 12px; font-size:13px; font-weight:950; cursor:pointer; }
    .lgx-btn.primary { background:#0f766e; color:white; } .lgx-btn.blue { background:#18A982; color:white; } .lgx-btn.light { background:#eef2f7; color:#0f172a; border:1px solid #dbe3ee; } .lgx-btn.gold { background:#D4AF37; color:#0f172a; }
    .lgx-filter-row { display:flex; gap:7px; overflow-x:auto; margin-bottom:12px; padding-bottom:4px; }
    .lgx-chip-btn { border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:999px; padding:8px 12px; font-size:12.5px; font-weight:950; white-space:nowrap; cursor:pointer; }
    .lgx-chip-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; }
    .lgx-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }
    .lgx-card { background:white; border:1px solid #e2e8f0; border-radius:18px; padding:14px; box-shadow:0 4px 14px rgba(15,23,42,.04); position:relative; }
    .lgx-card.sponsored { border-color:#fde68a; background:linear-gradient(180deg,#fff,#fffbeb); }
    .lgx-logo { width:48px; height:48px; border-radius:14px; background:#0f766e; color:white; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:950; flex-shrink:0; }
    .lgx-card-top { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
    .lgx-title { min-width:0; flex:1; } .lgx-title b { display:block; color:#0f172a; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .lgx-title small { display:block; color:#64748b; font-size:12.5px; margin-top:2px; }
    .lgx-pill { display:inline-flex; padding:3px 8px; border-radius:999px; background:#eef2f7; color:#334155; border:1px solid #dbe3ee; font-size:12px; font-weight:950; margin:2px; }
    .lgx-pill.green { background:#ecfdf5; color:#047857; border-color:#a7f3d0; } .lgx-pill.gold { background:#fffbeb; color:#b45309; border-color:#fde68a; } .lgx-pill.blue { background:#eff6ff; color:#00509d; border-color:#bfdbfe; }
    .lgx-score { position:absolute; top:12px; right:12px; background:#39779B; color:white; border-radius:999px; padding:5px 8px; font-size:12.5px; font-weight:950; }
    .lgx-details { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:10px; margin-top:10px; font-size:13px; color:#334155; line-height:1.55; }
    .lgx-vehicle-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
    .lgx-vehicle { background:white; border:1px solid #e2e8f0; border-radius:16px; padding:12px; }
    .lgx-vehicle.selected { border-color:#0f766e; box-shadow:0 0 0 3px rgba(15,118,110,.12); }
    .lgx-summary-card { background:white; border:1px solid #e2e8f0; border-radius:18px; padding:14px; margin-bottom:12px; }
    .lgx-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .lgx-summary-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:13px; padding:9px; text-align:center; }
    .lgx-summary-box small { display:block; color:#64748b; font-size:12px; font-weight:950; text-transform:uppercase; } .lgx-summary-box b { display:block; color:#0f172a; font-size:13px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .scart-delivery-summary { background:#f0fdfa; border:1px solid #99f6e4; color:#134e4a; border-radius:14px; padding:11px; font-size:12px; line-height:1.5; }
    @media(max-width:760px){ .lgx-toolbar{grid-template-columns:1fr;} .lgx-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));} } `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

window.logisticsMarketplaceState = window.logisticsMarketplaceState || { query:'', filter:'suggested', sort:'score', service:'sokohai_logistics', carriers:[], selectedCompany:null, selectedVehicle:null };

window.openLogisticsMarketplaceFromCart = async function(){
    if(!skh.smartCartItems().length) return alert('Cart iko wazi.');
    // Save address/notes from cart before opening marketplace.
    const addr=document.getElementById('smartShippingAddress')?.value; if(addr) window.smartCartState.address=addr;
    const notes=document.getElementById('smartOrderNotes')?.value; if(notes) window.smartCartState.notes=notes;
    let m=document.getElementById('logisticsMarketplaceModal');
    if(!m){ m=document.createElement('div'); m.id='logisticsMarketplaceModal'; m.className='overlay-menu'; m.style.cssText='display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    m.innerHTML=`<div class="lgx-shell"><div class="lgx-head"><div><h2> SokoHai Registered Logistics</h2><small>Search • Filters • AI Suggestions • Sponsored • Route Match • Vehicle Selection</small></div><button class="lgx-btn light" onclick="document.getElementById('logisticsMarketplaceModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="lgx-body"><div id="lgxSummary"></div><div class="lgx-toolbar"><input id="lgxSearch" placeholder="Search logistics company, route, vehicle..." oninput="window.logisticsMarketplaceState.query=this.value; window.renderLogisticsMarketplaceList();"><select id="lgxService" onchange="window.logisticsMarketplaceState.service=this.value; window.renderLogisticsMarketplaceList(true);"><option value="sokohai_logistics">SokoHai Logistics</option><option value="seller_delivery">Seller Delivery</option><option value="third_party_courier">Third Party Courier</option><option value="customer_pickup">Customer Pickup</option></select><select id="lgxSort" onchange="window.logisticsMarketplaceState.sort=this.value; window.renderLogisticsMarketplaceList();"><option value="score">Best Match</option><option value="price">Lowest Price</option><option value="eta">Fastest ETA</option><option value="rating">Highest Rating</option></select><button class="lgx-btn primary" onclick="window.renderLogisticsMarketplaceList(true)">Refresh</button></div><div class="lgx-filter-row" id="lgxFilters">${['suggested','sponsored','nearby','verified','premium','standard','economy'].map(f=>`<button class="lgx-chip-btn ${window.logisticsMarketplaceState.filter===f?'active':''}" onclick="window.setLogisticsFilter('${f}',this)">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div><div id="lgxList" class="lgx-grid"><p>Loading...</p></div><div id="lgxVehicleSection"></div></div></div>`;
    m.style.display='flex';
    await window.renderLogisticsMarketplaceList(true);
};

window.setLogisticsFilter=function(f,btn){ window.logisticsMarketplaceState.filter=f; document.querySelectorAll('#lgxFilters button').forEach(b=>b.classList.remove('active')); btn?.classList.add('active'); window.renderLogisticsMarketplaceList(); };

window.renderLogisticsMarketplaceList=async function(reload=false){
    const pkg=skh.lgxPackage(); if(reload || !window.logisticsMarketplaceState.carriers.length) await skh.lgxLoadCompanies();
    const summary=document.getElementById('lgxSummary'); if(summary) summary.innerHTML=`<div class="lgx-summary-card"><div class="lgx-summary-grid"><div class="lgx-summary-box"><small>Route</small><b>${lgxEscape(skh.lgxRouteText())}</b></div><div class="lgx-summary-box"><small>Weight</small><b>${pkg.weightKg}kg</b></div><div class="lgx-summary-box"><small>Cargo</small><b>${pkg.fragile?'Fragile ':''}${pkg.hazardous?'Hazardous ':''}${pkg.sizeClass}</b></div><div class="lgx-summary-box"><small>Sellers</small><b>${pkg.sellersCount}</b></div></div></div>`;
    const list=document.getElementById('lgxList'); if(!list) return;
    const filtered=skh.lgxApplyFilters(window.logisticsMarketplaceState.carriers);
    if(!filtered.length){ list.innerHTML='<div class="lgx-card">Hakuna logistics inayofaa. Badili filter au chagua Customer Pickup.</div>'; return; }
    list.innerHTML=filtered.map(c=>window.renderLogisticsCompanyCard(c)).join('');
};

window.renderLogisticsCompanyCard=function(c){
    return `<div class="lgx-card ${c.sponsored?'sponsored':''}"><span class="lgx-score">${c.matchScore}%</span><div class="lgx-card-top"><div class="lgx-logo">${c.logo?`<img src="${c.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">`:''}</div><div class="lgx-title"><b>${lgxEscape(c.company||c.name)}</b><small>${lgxEscape(c.name)} • ${lgxEscape(c.coverageArea)}</small></div></div><div><span class="lgx-pill ${c.verified?'green':''}">${c.verified?' Verified':'Pending'}</span><span class="lgx-pill blue"> ${c.rating}</span>${c.sponsored?'<span class="lgx-pill gold">Sponsored</span>':''}${c.premium?'<span class="lgx-pill green">Premium</span>':''}</div><div class="orch-carrier-meta"><span class="orch-chip">ETA: ${lgxEscape(c.eta)}</span><span class="orch-chip">From TSh ${Number(c.price||0).toLocaleString()}</span><span class="orch-chip">Vehicles: ${c.activeVehicles}</span><span class="orch-chip">Deliveries: ${c.completedDeliveries}</span></div><div class="lgx-details" id="details_${c.id}" style="display:none;"><b>Company Details</b><br>Fleet: ${lgxEscape(c.vehicleType)} • Drivers: Available<br>Insurance: ${c.insurance?'Yes':'No'} • Licenses: ${c.verified?'Verified':'Pending'}<br>Warehouses: ${lgxEscape(c.warehouses)} • Branches: ${lgxEscape(c.branches)}<br>Cold Chain: ${c.coldChain?'Yes':'No'} • Heavy Cargo: ${c.heavyCargo?'Yes':'No'} • Fragile: ${c.fragileCargo?'Yes':'No'} • Express: ${c.expressDelivery?'Yes':'No'}<br>Operating Hours: ${lgxEscape(c.operatingHours)}</div><div style="display:flex;gap:7px;margin-top:10px;"><button class="lgx-btn light" onclick="const d=document.getElementById('details_${c.id}'); d.style.display=d.style.display==='none'?'block':'none';">View Details</button><button class="lgx-btn primary" onclick="window.openVehicleSelection('${c.id}')">Select</button></div></div>`;
};

window.openVehicleSelection=function(companyId){
    const company=window.logisticsMarketplaceState.carriers.find(c=>c.id===companyId); if(!company) return;
    window.logisticsMarketplaceState.selectedCompany=company;
    const pkg=skh.lgxPackage(); const vehicles=skh.lgxVehicleOptions(company,pkg); const host=document.getElementById('lgxVehicleSection'); if(!host) return;
    host.innerHTML=`<div class="lgx-summary-card"><div class="orch-title"><b> Vehicle Selection • ${lgxEscape(company.company||company.name)}</b><span class="scart-badge">Route Matched</span></div><div class="lgx-vehicle-grid">${vehicles.map(v=>`<div class="lgx-vehicle ${window.logisticsMarketplaceState.selectedVehicle?.id===v.id?'selected':''}"><b>${v.icon} ${v.type}</b><small style="display:block;color:#64748b;margin:4px 0;">Plate: ${v.plate}<br>Capacity: ${v.capacityKg}kg • Status: ${v.status}<br>Insurance: ${v.insurance?'Yes':'No'} • Driver Rating: ${v.driverRating}<br>ETA: ${v.eta} • Cost: TSh ${Number(v.cost).toLocaleString()}</small><button class="lgx-btn primary" style="width:100%;" onclick="window.selectLogisticsVehicle('${company.id}','${v.id}')">Select Vehicle</button></div>`).join('')}</div></div>`;
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
};

window.selectLogisticsVehicle=function(companyId,vehicleId){
    const company=window.logisticsMarketplaceState.carriers.find(c=>c.id===companyId); const vehicle=skh.lgxVehicleOptions(company,skh.lgxPackage()).find(v=>v.id===vehicleId); if(!company||!vehicle) return;
    window.logisticsMarketplaceState.selectedCompany=company; window.logisticsMarketplaceState.selectedVehicle=vehicle;
    window.smartCartState.selectedCarrier={ ...company, selectedVehicle:vehicle, vehicleType:vehicle.type, vehicle:vehicle.type, capacityKg:vehicle.capacityKg, capacity:`${vehicle.capacityKg} kg`, price:vehicle.cost, eta:vehicle.eta, plate:vehicle.plate, insurance:vehicle.insurance, driverName:company.driverName, driverPhone:company.driverPhone, matchScore:company.matchScore, marketplaceSelected:true };
    window.smartCartState.shippingService=company.service; window.smartCartState.shippingMethod=company.service; window.smartCartState.shippingCost=vehicle.cost;
    alert(` Logistics Selected\n${company.company||company.name}\nVehicle: ${vehicle.type}\nCost: TSh ${vehicle.cost.toLocaleString()}\n\nUnarudi Cart kwa checkout.`);
    document.getElementById('logisticsMarketplaceModal').style.display='none';
    window.openCart();
};

const _renderSmartCartCleanOld = window.renderSmartCart;

window.renderSmartCart = function(){
    if(_renderSmartCartCleanOld) _renderSmartCartCleanOld();
    const host=document.getElementById('smartShippingOrchestrationHost');
    if(host){
        const sel=window.smartCartState.selectedCarrier;
        host.innerHTML=`<div class="orch-card"><div class="orch-title"><b> Delivery Selection</b><span class="scart-badge">Logistics Marketplace</span></div>${sel?`<div class="scart-delivery-summary"><b>Selected Logistics:</b> ${lgxEscape(sel.company||sel.name)}<br><b>Vehicle:</b> ${lgxEscape(sel.selectedVehicle?.type||sel.vehicleType)} • <b>ETA:</b> ${lgxEscape(sel.eta)} • <b>Cost:</b> TSh ${Number(sel.price||0).toLocaleString()}<br><b>Insurance:</b> ${sel.insurance?'Yes':'No'} • <b>Tracking:</b> Available</div>`:`<div class="orch-note">Chagua kampuni ya usafirishaji kwenye SokoHai Logistics Marketplace kabla ya checkout.</div>`}<button class="scart-btn scart-btn-primary" style="width:100%;margin-top:10px;" onclick="window.openLogisticsMarketplaceFromCart()">Select Delivery / Open Logistics Marketplace</button></div>`;
    }
};

(function injectLogisticsCompletionCSS(){
    const css = `
    .ops-modal-card{width:96%;max-width:980px;max-height:92vh;background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 72px rgba(15,23,42,.45)}
    .ops-head{background:#F0F7FA; color:#18352D; border-bottom:1px solid #D6E8EF;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}.ops-head h2{margin:0;font-size:18px}.ops-head small{color:#ccfbf1;font-size:13px}
    .ops-body{padding:14px;background:#f8fafc;overflow-y:auto}.ops-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:14px;margin-bottom:12px;box-shadow:0 4px 14px rgba(15,23,42,.04)}
    .ops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.ops-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eef2f7;font-size:12px;color:#334155}.ops-row:last-child{border-bottom:none}.ops-row b{color:#0f172a;text-align:right}
    .ops-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ops-btn{border:none;border-radius:12px;min-height:38px;padding:8px 11px;font-size:13px;font-weight:950;cursor:pointer}.ops-btn.primary{background:#18A982;color:white}.ops-btn.green{background:#18A982;color:white}.ops-btn.red{background:#e11d48;color:white}.ops-btn.light{background:#eef2f7;color:#0f172a;border:1px solid #dbe3ee}.ops-pill{display:inline-flex;padding:3px 8px;border-radius:999px;background:#eef2f7;color:#334155;border:1px solid #dbe3ee;font-size:12px;font-weight:950}.ops-pill.green{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.ops-pill.amber{background:#fffbeb;color:#b45309;border-color:#fde68a}.ops-pill.red{background:#fff5f5;color:#991b1b;border-color:#fecaca}
    .cart-delivery-clean{background:#f0fdfa;border:1px solid #99f6e4;color:#134e4a;border-radius:16px;padding:12px;font-size:12px;line-height:1.55}.cart-delivery-clean b{color:#0f172a}.cart-delivery-empty{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:16px;padding:12px;font-size:12px;line-height:1.55} `;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

const _oldLoadSokoHaiCarriers = window.loadSokoHaiCarriers;

window.loadSokoHaiCarriers = async function(){
    let carriers = [];
    try { if(_oldLoadSokoHaiCarriers) carriers = await _oldLoadSokoHaiCarriers(); } catch(e) { carriers = [...(window.sokohaiCarrierFallbacks||[])]; }
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db,'logistics_companies'), skh.limit(50)));
        snap.forEach(d => {
            const x=d.data();
            carriers.push({
                id:d.id, name:x.companyName||x.name||'Logistics Company', company:x.companyName||x.name||'Logistics', service:x.service||'sokohai_logistics', eta:x.eta||x.defaultEta||'Same/Next Day',
                vehicleType:x.primaryVehicle||x.vehicleType||'Fleet', vehicle:x.primaryVehicle||'Fleet', capacityKg:skh.orchNum(x.capacityKg||x.maxCapacityKg,500), capacity:x.capacityLabel||`${x.capacityKg||x.maxCapacityKg||500} kg`, price:skh.orchNum(x.startingPrice||x.price,10000),
                insurance:!!x.insurance, verified:!!x.verified, rating:x.rating||'—', driverName:'Assign after acceptance', driverPhone:x.supportPhone||'', plate:'After assignment', suitableFor:x.suitableFor||['small','medium'],
                sponsored:!!x.sponsored, premium:!!x.premium, coverageArea:x.coverageArea||x.routes||'Registered routes', completedDeliveries:x.completedDeliveries||0, activeVehicles:x.activeVehicles||0,
                branches:x.branches||'—', warehouses:x.warehouses||'—', operatingHours:x.operatingHours||'—', coldChain:!!x.coldChain, heavyCargo:!!x.heavyCargo, fragileCargo:!!x.fragileCargo, expressDelivery:!!x.expressDelivery, source:'logistics_companies'
            });
        });
    } catch(e) { console.log('logistics_companies load skipped', e.message); }
    const seen=new Set();
    return carriers.filter(c => { const k=(c.id||c.name)+'_'+(c.company||''); if(seen.has(k)) return false; seen.add(k); return true; });
};

const _oldRenderSmartCartDeliveryClean = window.renderSmartCart;

window.renderSmartCart = function(){
    if(_oldRenderSmartCartDeliveryClean) _oldRenderSmartCartDeliveryClean();
    const host=document.getElementById('smartShippingOrchestrationHost');
    if(host){
        const sel=window.smartCartState.selectedCarrier;
        host.innerHTML = `<div class="orch-card"><div class="orch-title"><b> Delivery Selection</b><span class="scart-badge">Separate Logistics Marketplace</span></div>${sel?`<div class="cart-delivery-clean"><b>Selected Logistics:</b> ${lgxEscape(sel.company||sel.name)}<br><b>Vehicle:</b> ${lgxEscape(sel.selectedVehicle?.type||sel.vehicleType||sel.vehicle)} • <b>ETA:</b> ${lgxEscape(sel.eta)}<br><b>Shipping Cost:</b> TSh ${Number(sel.price||0).toLocaleString()} • <b>Insurance:</b> ${sel.insurance?'Yes':'No'} • <b>Tracking:</b> Available<br><b>Match Score:</b> ${sel.matchScore||'—'}%</div>`:`<div class="cart-delivery-empty"><b>Delivery not selected yet.</b><br>Cart inabaki safi. Bonyeza hapa chini kufungua SokoHai Registered Logistics na uchague kampuni + gari.</div>`}<button class="scart-btn scart-btn-primary" style="width:100%;margin-top:10px;" onclick="window.openLogisticsMarketplaceFromCart()">${sel?'Change Logistics':'Select Delivery'} / Open Logistics Marketplace</button></div>`;
    }
};

window.ensureSellerOrderInboxModal = function(){
    let m=document.getElementById('sellerOrderInboxModal');
    if(m) return m;
    m=document.createElement('div'); m.id='sellerOrderInboxModal'; m.className='overlay-menu'; m.style.cssText='z-index:100010;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); return m;
};

window.openSellerOrderInbox = function(){
    if(!skh.currentUser) return window.openAuthModal?.();
    const m=window.ensureSellerOrderInboxModal();
    m.innerHTML=`<div class="ops-modal-card"><div class="ops-head"><div><h2> Seller Order Inbox</h2><small>Buyer • Payment • Escrow • Selected Logistics • Pickup/Delivery</small></div><button class="ops-btn light" onclick="document.getElementById('sellerOrderInboxModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="ops-body" id="sellerOrderInboxList"><p style="text-align:center;color:#64748b;">Inapakia orders...</p></div></div>`;
    m.style.display='flex';
    window.loadSellerOrderInbox();
};

window.loadSellerOrderInbox = function(){
    const box=document.getElementById('sellerOrderInboxList'); if(!box) return;
    try{
        const qInbox=skh.query(skh.collection(skh.db,'seller_order_inbox'), skh.where('sellerId','==',skh.currentUser.uid), skh.orderBy('createdAt','desc'), skh.limit(50));
        window.skhOnSnapshot('seller-inbox', qInbox, snap=>{
            if(snap.empty){ box.innerHTML='<div class="ops-card" style="text-align:center;color:#64748b;">Hakuna seller orders bado.</div>'; return; }
            box.innerHTML='';
            snap.forEach(d=>{ const x={id:d.id,...d.data()}; box.innerHTML += `<div class="ops-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b>${x.orderId}</b><span class="ops-pill amber">${x.status||'new_order'}</span></div><div class="ops-grid" style="margin-top:10px;"><div class="ops-row"><span>Buyer</span><b>${skh.skhEscape(lgxEscape(x.buyerDetails?.buyerName||x.buyerDetails?.buyerId))}</b></div><div class="ops-row"><span>Payment</span><b>${lgxEscape(x.paymentStatus)}</b></div><div class="ops-row"><span>Escrow</span><b>${lgxEscape(x.escrowStatus)}</b></div><div class="ops-row"><span>Logistics</span><b>${lgxEscape(x.selectedShippingCompany)}</b></div><div class="ops-row"><span>Pickup</span><b>${lgxEscape(x.pickupAddress)}</b></div><div class="ops-row"><span>Delivery</span><b>${lgxEscape(x.deliveryAddress)}</b></div></div><div class="ops-actions"><button class="ops-btn green" onclick="window.sellerConfirmOrder('${x.id}','${x.sokopayCoreId||''}')">Confirm Order</button><button class="ops-btn primary" onclick="window.sellerMarkPacked('${x.id}','${x.sokopayCoreId||''}')">Mark Packed</button><button class="ops-btn light" onclick="window.openSokoPayOrderDetail&&window.openSokoPayOrderDetail('${x.sokopayCoreId||''}')">Open SokoPay</button></div></div>`; });
        });
    }catch(e){ box.innerHTML='<p style="color:#e11d48;">Seller inbox failed: '+e.message+'</p>'; }
};

window.sellerConfirmOrder = async function(inboxId, coreId){
    await skh.updateDoc(skh.doc(skh.db,'seller_order_inbox',inboxId), { status:'seller_confirmed', updatedAt:new Date().toISOString() }).catch(()=>{});
    if(coreId) await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreId), { orderStatus:'Confirmed', shipmentStatus:'Preparing', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:'Seller Confirmed',description:'Seller confirmed order and pickup preparation.',at:new Date().toISOString(),done:true}) }).catch(()=>{});
    alert('Order confirmed.');
};

window.sellerMarkPacked = async function(inboxId, coreId){
    await skh.updateDoc(skh.doc(skh.db,'seller_order_inbox',inboxId), { status:'packed', shipmentStatus:'Packed', updatedAt:new Date().toISOString() }).catch(()=>{});
    if(coreId) await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreId), { shipmentStatus:'Packed', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:'Packed',description:'Seller packed the order.',at:new Date().toISOString(),done:true}) }).catch(()=>{});
    alert('Marked as packed.');
};

window.ensureLogisticsOpsModal = function(){
    let m=document.getElementById('logisticsOpsModal'); if(m) return m;
    m=document.createElement('div'); m.id='logisticsOpsModal'; m.className='overlay-menu'; m.style.cssText='z-index:100011;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); return m;
};

window.openLogisticsDashboard = function(){
    if(!skh.currentUser) return window.openAuthModal?.();
    const m=window.ensureLogisticsOpsModal();
    m.innerHTML=`<div class="ops-modal-card"><div class="ops-head"><div><h2> Logistics Dashboard</h2><small>Pickup Requests • Accept/Reject • Assign Driver/Vehicle • Pickup • Delivery</small></div><button class="ops-btn light" onclick="document.getElementById('logisticsOpsModal').style.display='none'" aria-label="Funga">${window.skhNavIcon ? window.skhNavIcon('x',16) : ''}</button></div><div class="ops-body" id="logisticsOpsList"><p style="text-align:center;color:#64748b;">Inapakia assignments...</p></div></div>`;
    m.style.display='flex';
    window.loadLogisticsAssignments();
};

window.loadLogisticsAssignments = function(){
    const box=document.getElementById('logisticsOpsList'); if(!box) return;
    try{
        // Show recent assignments. In production, filter by logistics company ID/user membership.
        const qA=skh.query(skh.collection(skh.db,'logistics_assignments'), skh.orderBy('createdAt','desc'), skh.limit(50));
        window.skhOnSnapshot('seller-orders', qA, snap=>{
            if(snap.empty){ box.innerHTML='<div class="ops-card" style="text-align:center;color:#64748b;">Hakuna pickup requests bado.</div>'; return; }
            box.innerHTML='';
            snap.forEach(d=>{ const a={id:d.id,...d.data()}; box.innerHTML += `<div class="ops-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><b>${a.shipmentId||a.orderId}</b><span class="ops-pill ${a.assignmentStatus==='accepted'?'green':a.assignmentStatus==='rejected'?'red':'amber'}">${a.assignmentStatus||a.logisticsDashboardStatus||'pending'}</span></div><div class="ops-grid" style="margin-top:10px;"><div class="ops-row"><span>Pickup</span><b>${lgxEscape(a.pickupLocation)}</b></div><div class="ops-row"><span>Delivery</span><b>${lgxEscape(a.deliveryAddress)}</b></div><div class="ops-row"><span>Courier</span><b>${lgxEscape(a.courierName||a.courierCompany)}</b></div><div class="ops-row"><span>Vehicle</span><b>${lgxEscape(a.vehicleType)} • ${lgxEscape(a.vehiclePlate)}</b></div><div class="ops-row"><span>Weight</span><b>${a.package?.weightKg||'—'} kg</b></div><div class="ops-row"><span>Escrow</span><b>${lgxEscape(a.escrowStatus)}</b></div><div class="ops-row"><span>Token</span><b>${lgxEscape(a.shipmentToken)}</b></div><div class="ops-row"><span>Status</span><b>${lgxEscape(a.status)}</b></div></div><div class="ops-actions"><button class="ops-btn green" onclick="window.logisticsAcceptAssignment('${a.id}','${a.shipmentDocId||''}','${a.sokopayCoreId||''}')">Accept</button><button class="ops-btn red" onclick="window.logisticsRejectAssignment('${a.id}')">Reject</button><button class="ops-btn primary" onclick="window.logisticsAssignDriverVehicle('${a.id}','${a.shipmentDocId||''}')">Assign Driver</button><button class="ops-btn light" onclick="window.logisticsUpdateShipmentStep('${a.id}','${a.shipmentDocId||''}','Collected')">Pickup</button><button class="ops-btn light" onclick="window.logisticsUpdateShipmentStep('${a.id}','${a.shipmentDocId||''}','In Transit')">In Transit</button><button class="ops-btn green" onclick="window.logisticsUpdateShipmentStep('${a.id}','${a.shipmentDocId||''}','Delivered')">Delivered</button></div></div>`; });
        });
    }catch(e){ box.innerHTML='<p style="color:#e11d48;">Assignments failed: '+e.message+'</p>'; }
};

window.logisticsAcceptAssignment = async function(id, shipmentDocId, coreId){
    await skh.updateDoc(skh.doc(skh.db,'logistics_assignments',id), { assignmentStatus:'accepted', logisticsDashboardStatus:'accepted', status:'Courier Assigned', acceptedAt:new Date().toISOString() }).catch(()=>{});
    if(shipmentDocId) await skh.updateDoc(skh.doc(skh.db,'shipments',shipmentDocId), { status:'Courier Assigned', updatedAt:new Date().toISOString() }).catch(()=>{});
    if(coreId) await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreId), { shipmentStatus:'Courier Assigned', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:'Courier Assigned',description:'Logistics company accepted shipment.',at:new Date().toISOString(),done:true}) }).catch(()=>{});
};

window.logisticsRejectAssignment = async function(id){ const reason=await skhPrompt('Sababu ya kukataa assignment:')||'Rejected'; await skh.updateDoc(skh.doc(skh.db,'logistics_assignments',id), { assignmentStatus:'rejected', logisticsDashboardStatus:'rejected', rejectReason:reason, rejectedAt:new Date().toISOString() }).catch(()=>{}); };

window.logisticsAssignDriverVehicle = async function(id, shipmentDocId){
    const driver=await skhPrompt('Driver name:', 'Driver'); if(!driver) return;
    const phone=await skhPrompt('Driver phone:', '07XXXXXXXX') || '';
    const plate=await skhPrompt('Vehicle plate:', 'T XXX XXX') || '';
    const update={ driverName:driver, driverPhone:phone, vehiclePlate:plate, assignmentStatus:'accepted', driverAssignedAt:new Date().toISOString(), status:'Driver Assigned' };
    await skh.updateDoc(skh.doc(skh.db,'logistics_assignments',id), update).catch(()=>{});
    if(shipmentDocId) await skh.updateDoc(skh.doc(skh.db,'shipments',shipmentDocId), update).catch(()=>{});
};

window.logisticsUpdateShipmentStep = async function(id, shipmentDocId, status){
    const update={ status, updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:status,at:new Date().toISOString(),done:true}) };
    await skh.updateDoc(skh.doc(skh.db,'logistics_assignments',id), update).catch(()=>{});
    if(shipmentDocId) await skh.updateDoc(skh.doc(skh.db,'shipments',shipmentDocId), update).catch(()=>{});
};

window.openSellerLogisticsTools = async function(){
    const choice=await skhPrompt('Andika: seller au logistics', 'seller');
    if(String(choice).toLowerCase().startsWith('log')) window.openLogisticsDashboard(); else window.openSellerOrderInbox();
};

(function(){
  if (window.__FINAL_CART_LOGISTICS_WIRED__) return;
  window.__FINAL_CART_LOGISTICS_WIRED__ = true;

  const esc = (s='') => (typeof skh.skhEscape === 'function' ? skh.skhEscape(s) : String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])));
  const money = n => 'TSh ' + (Number(n||0)).toLocaleString();
  const readCart = () => { try { skh.myCart = JSON.parse(skh.localStorage.getItem('sokohai_cart') || '[]') || []; } catch(e) { skh.myCart = skh.myCart || []; } return skh.myCart || []; };
  const writeCart = () => { try { skh.localStorage.setItem('sokohai_cart', JSON.stringify(skh.myCart || [])); } catch(e) {} try { if(skh.currentUserData?.docId) skh.updateDoc(skh.doc(skh.db,'users',skh.currentUserData.docId), { cart: skh.myCart || [] }); } catch(e) {} };
  const itemPrice = x => parseFloat(String(x.price ?? x.unitPrice ?? x.cartMeta?.unitPrice ?? 0).replace(/,/g,'')) || 0;
  const itemQty = x => Math.max(1, parseInt(x.qty || x.quantity || 1));
  const itemSellerId = x => x.sellerId || x.userId || x.ownerId || x.cartMeta?.sellerId || 'unknown_seller';
  const itemSellerName = x => x.sellerName || x.ownerName || x.seller || x.cartMeta?.sellerName || 'Seller';
  const itemImg = x => { try { return skh.getOptimizedImageUrl(x.image || x.images?.[0] || x.cartMeta?.productImages?.[0] || ''); } catch(e) { return x.image || x.images?.[0] || ''; } };

  function cartTotals(){
    const items = readCart();
    const productsTotal = items.reduce((s,x)=>s + itemPrice(x)*itemQty(x), 0);
    const selected = window.smartCartState?.selectedCarrier || null;
    const shipping = selected ? Number(selected.price || 0) : 0;
    const escrowFee = Math.round(productsTotal * 0.015);
    const discount = Number(window.smartCartState?.discount || 0);
    const total = Math.max(0, productsTotal + shipping + escrowFee - discount);
    return { items, count:items.reduce((s,x)=>s+itemQty(x),0), productsTotal, shipping, escrowFee, discount, total, selected };
  }

  function ensureCartCSS(){
    if(document.getElementById('finalCartLogisticsCSS')) return;
    const css = `
    .fcart-shell{width:96%;max-width:900px;max-height:92vh;background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 72px rgba(15,23,42,.45)}
    .fcart-head{background:#F1FBF7; color:#18352D; border-bottom:1px solid #D9EEE5;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}.fcart-head h2{margin:0;font-size:18px}.fcart-head small{color:#cbd5e1;font-size:13px}.fcart-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .fcart-body{display:grid;grid-template-columns:1.55fr .85fr;gap:0;min-height:0;flex:1;background:#f8fafc}.fcart-main{padding:14px;overflow-y:auto}.fcart-side{padding:14px;background:white;border-left:1px solid #e2e8f0;overflow-y:auto}.fcart-section{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:14px;margin-bottom:12px;box-shadow:0 4px 14px rgba(15,23,42,.04)}
    .fcart-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.fcart-title b{font-size:13px;color:#0f172a}.fcart-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:950}
    .fcart-item{display:grid;grid-template-columns:70px 1fr auto;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:16px;background:white;margin-bottom:9px}.fcart-item img{width:70px;height:70px;border-radius:12px;object-fit:cover;background:#e2e8f0}.fcart-item b{font-size:13px;color:#0f172a}.fcart-item small{display:block;color:#64748b;font-size:12.5px;margin-top:3px}.fcart-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.fcart-meta span{background:#f1f5f9;border:1px solid #e2e8f0;color:#334155;border-radius:999px;padding:3px 7px;font-size:12px;font-weight:850}
    .fcart-btn{border:none;border-radius:12px;min-height:39px;padding:9px 12px;font-size:13px;font-weight:950;cursor:pointer}.fcart-btn.primary{background:#18A982;color:white}.fcart-btn.gold{background:#D4AF37;color:#0f172a}.fcart-btn.red{background:#e11d48;color:white}.fcart-btn.green{background:#18A982;color:white}.fcart-btn.light{background:#eef2f7;color:#0f172a;border:1px solid #dbe3ee}.fcart-btn.full{width:100%;margin-top:8px}.fcart-btn:disabled{opacity:.55;cursor:not-allowed}
    .fcart-delivery-empty{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:16px;padding:12px;font-size:12px;line-height:1.55}.fcart-delivery-selected{background:#f0fdfa;border:1px solid #99f6e4;color:#134e4a;border-radius:16px;padding:12px;font-size:12px;line-height:1.55}.fcart-line{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f7;padding:8px 0;font-size:12px;color:#334155}.fcart-line:last-child{border-bottom:none}.fcart-total{background:#EAF8F2;color:#17604E;border:1px solid #CCEBDD;border-radius:18px;padding:14px;text-align:center;margin-bottom:10px}.fcart-total small{display:block;color:#65757A;font-size:12.5px;text-transform:uppercase;font-weight:950}.fcart-total b{display:block;font-size:25px;margin-top:4px}
    .lgx-final-shell{width:96%;max-width:1050px;max-height:92vh;background:white;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 74px rgba(15,23,42,.45)}.lgx-final-head{background:#F0F7FA; color:#18352D; border-bottom:1px solid #D6E8EF;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}.lgx-final-body{background:#f8fafc;padding:14px;overflow-y:auto}.lgx-final-toolbar{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-bottom:12px}.lgx-final-toolbar input,.lgx-final-toolbar select{border:1px solid #cbd5e1;border-radius:12px;padding:11px;font-size:12px;background:white}.lgx-final-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:12px}.lgx-final-card{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:14px;box-shadow:0 4px 14px rgba(15,23,42,.04)}.lgx-final-card.sponsored{border-color:#fde68a;background:linear-gradient(180deg,#fff,#fffbeb)}.lgx-final-score{float:right;background:#39779B;color:white;border-radius:999px;padding:5px 8px;font-size:12.5px;font-weight:950}.lgx-final-pill{display:inline-flex;margin:2px;padding:3px 8px;border-radius:999px;background:#eef2f7;border:1px solid #dbe3ee;color:#334155;font-size:12px;font-weight:950}.lgx-final-pill.green{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.lgx-final-pill.gold{background:#fffbeb;color:#b45309;border-color:#fde68a}.lgx-final-vehicles{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px;margin-top:10px}.lgx-final-vehicle{border:1px solid #e2e8f0;border-radius:14px;padding:10px;background:#f8fafc}
    @media(max-width:780px){.fcart-body{grid-template-columns:1fr}.fcart-side{border-left:none;border-top:1px solid #e2e8f0}.fcart-item{grid-template-columns:58px 1fr}.fcart-item img{width:58px;height:58px}.fcart-item>div:last-child{grid-column:1/-1}.lgx-final-toolbar{grid-template-columns:1fr}.fcart-head{flex-direction:column;align-items:flex-start}.fcart-head-actions{width:100%}.fcart-head-actions button{flex:1}.fcart-shell,.lgx-final-shell{width:98%;max-height:94vh;border-radius:18px}} `;
    const st=document.createElement('style'); st.id='finalCartLogisticsCSS'; st.textContent=css; document.head.appendChild(st);
  }

  function renderItem(x,i){
    const meta = x.cartMeta || {};
    return `<div class="fcart-item"><img src="${itemImg(x)}" onerror="this.style.display='none'"><div><b>${esc(x.title||x.name||meta.productName||'Product')}</b><small>${money(itemPrice(x))} • Qty ${itemQty(x)} • Subtotal ${money(itemPrice(x)*itemQty(x))}</small><div class="fcart-meta"><span>Seller: ${esc(itemSellerName(x))}</span><span>SKU: ${esc(meta.sku||x.sku||'—')}</span><span>Stock: ${esc(meta.availableStock||x.stock||'—')}</span><span>${meta.fragile?'Fragile':'Standard'}</span><span>${meta.weightKg||x.weightKg||1}kg</span></div></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="fcart-btn light" onclick="window.finalCartQty(${i},-1)">−</button><button class="fcart-btn light" onclick="window.finalCartQty(${i},1)">+</button><button class="fcart-btn red" onclick="window.finalCartRemove(${i})">Remove</button></div></div>`;
  }

  window.finalRenderCart = function(){
    ensureCartCSS();
    const modal = document.getElementById('cartModal'); if(!modal) return;
    const t = cartTotals();
    const selected = t.selected;
    modal.innerHTML = `<div class="fcart-shell"><div class="fcart-head"><div><h2> SokoCart</h2><small>Items: ${t.count} • Total: ${money(t.total)} • Protected by SokoPay Escrow</small></div><div class="fcart-head-actions"><button class="fcart-btn light" onclick="window.closeModals()">Continue</button><button class="fcart-btn light" onclick="window.saveCartForLater&&window.saveCartForLater()">Save</button><button class="fcart-btn red" onclick="window.finalClearCart()">Clear</button></div></div><div class="fcart-body"><div class="fcart-main"><div class="fcart-section"><div class="fcart-title"><b>Product Information</b><span class="fcart-badge">Live linked</span></div>${t.items.length?t.items.map(renderItem).join(''):'<p style="text-align:center;color:#64748b;">Cart iko wazi.</p>'}</div><div class="fcart-section"><div class="fcart-title"><b> Delivery Selection</b><span class="fcart-badge">Separate Marketplace</span></div>${selected?`<div class="fcart-delivery-selected"><b>Selected Logistics:</b> ${esc(selected.company||selected.name)}<br><b>Vehicle:</b> ${esc(selected.selectedVehicle?.type||selected.vehicleType||selected.vehicle||'—')} • <b>ETA:</b> ${esc(selected.eta||'—')}<br><b>Shipping Cost:</b> ${money(selected.price||0)} • <b>Insurance:</b> ${selected.insurance?'Yes':'No'} • <b>Tracking:</b> Available<br><b>Match:</b> ${selected.matchScore||'—'}%</div>`:`<div class="fcart-delivery-empty"><b>Delivery haijachaguliwa.</b><br>Cart ibaki safi. Fungua SokoHai Logistics Marketplace kuchagua kampuni na gari.</div>`}<button id="openLogisticsMarketplaceBtn" class="fcart-btn primary full" onclick="window.openLogisticsMarketplaceFromCart()"> Select Delivery / Open SokoHai Logistics</button></div><div class="fcart-section"><div class="fcart-title"><b> Order Notes</b></div><textarea id="smartOrderNotes" style="width:100%;min-height:70px;border:1px solid #cbd5e1;border-radius:12px;padding:10px;" placeholder="Delivery instructions, special request...">${skh.skhJsEsc(window.smartCartState?.notes||'')}</textarea></div></div><div class="fcart-side"><div class="fcart-total"><small>Grand Total</small><b>${money(t.total)}</b></div><div class="fcart-section"><div class="fcart-title"><b>Cost Breakdown</b></div><div class="fcart-line"><span>Products</span><b>${money(t.productsTotal)}</b></div><div class="fcart-line"><span>Shipping</span><b>${money(t.shipping)}</b></div><div class="fcart-line"><span>Escrow Fee</span><b>${money(t.escrowFee)}</b></div><div class="fcart-line"><span>Discount</span><b>- ${money(t.discount)}</b></div><div class="fcart-line"><span>Total</span><b>${money(t.total)}</b></div></div><div class="fcart-section"><div class="fcart-title"><b>SokoPay Protection</b></div><p style="font-size:12px;color:#64748b;line-height:1.5;">Payment, escrow, shipment token, tracking, contract and dispute all go through one SokoPay Core Engine.</p></div><button class="fcart-btn gold full" ${t.items.length?'':'disabled'} onclick="window.finalProceedCheckout()">Proceed to Checkout</button></div></div></div>`;
  };

  window.openCart = async function(){
    if(typeof skh.requireAuth === 'function' && !skh.requireAuth()) return;
    ensureCartCSS();
    try { if(typeof window.hydrateSmartCartProducts === 'function') await window.hydrateSmartCartProducts(); } catch(e) {}
    if(typeof closeModals === 'function') closeModals();
    const modal = document.getElementById('cartModal'); if(modal){ modal.style.display='flex'; window.finalRenderCart(); }
  };

  window.finalCartQty = function(i,d){ const items=readCart(); if(!items[i]) return; items[i].qty=itemQty(items[i])+d; if(items[i].qty<1) items[i].qty=1; skh.myCart=items; writeCart(); window.finalRenderCart(); };
  window.finalCartRemove = function(i){ const items=readCart(); items.splice(i,1); skh.myCart=items; writeCart(); window.finalRenderCart(); };
  window.finalClearCart = async function(){ if(await skhConfirm('Futa cart yote?')){ skh.myCart=[]; writeCart(); window.finalRenderCart(); } };

  function pkgSummary(){
    if(typeof skh.orchPackageSummary === 'function') return skh.orchPackageSummary(readCart());
    let w=0; readCart().forEach(x=>{ w += (x.cartMeta?.weightKg || x.weightKg || 1)*itemQty(x); });
    return { weightKg:w, fragile:readCart().some(x=>x.cartMeta?.fragile||x.fragile), hazardous:false, sizeClass:w<=25?'small':w<=500?'medium':'large', sellersCount:new Set(readCart().map(itemSellerId)).size };
  }
  function fallbackCompanies(){
    return (window.sokohaiCarrierFallbacks||[]).map((c,i)=>({ ...c, id:c.id||('carrier_'+i), company:c.company||c.name, matchScore:c.matchScore||Math.min(98,75+i*3), completedDeliveries:c.completedDeliveries||120+i*40, activeVehicles:c.activeVehicles||3+i, coverageArea:c.coverageArea||'Local/Regional', sponsored:!!c.sponsored||i===1 }));
  }
  async function companies(){
    let list=[];
    try { if(typeof window.loadSokoHaiCarriers === 'function') list = await window.loadSokoHaiCarriers(); } catch(e) {}
    if(!list.length) list=fallbackCompanies();
    const pkg=pkgSummary();
    return list.filter(c=>(c.capacityKg||999999)>=pkg.weightKg).map((c,i)=>({ ...c, id:c.id||('lgx_'+i), company:c.company||c.name, matchScore:c.matchScore||Math.min(99,70+(c.verified?10:0)+(c.insurance&&pkg.fragile?8:0)+(c.sponsored?5:0)+i) })).sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));
  }
  function vehiclesFor(c){
    if(typeof skh.lgxVehicleOptions === 'function') return skh.lgxVehicleOptions(c,pkgSummary());
    return [{id:c.id+'_moto',type:'Motorcycle',icon:'',capacityKg:25,cost:c.price||6000,eta:'2 Hours',insurance:c.insurance},{id:c.id+'_van',type:'Van',icon:'',capacityKg:2000,cost:(c.price||10000)+8000,eta:'1 Day',insurance:true}].filter(v=>v.capacityKg>=pkgSummary().weightKg);
  }
  function companyCard(c){
    return `<div class="lgx-final-card ${c.sponsored?'sponsored':''}"><span class="lgx-final-score">${c.matchScore||'—'}%</span><h3 style="margin:0 0 5px;color:#0f172a;font-size:15px;"> ${esc(c.company||c.name)}</h3><div><span class="lgx-final-pill ${c.verified?'green':''}">${c.verified?' Verified':'Pending'}</span><span class="lgx-final-pill"> ${c.rating||'—'}</span>${c.sponsored?'<span class="lgx-final-pill gold">Sponsored</span>':''}</div><p style="font-size:13px;color:#64748b;line-height:1.5;">Deliveries: ${c.completedDeliveries||'—'} • Vehicles: ${c.activeVehicles||'—'}<br>Coverage: ${esc(c.coverageArea||'—')} • ETA: ${esc(c.eta||'—')}<br>Starting Price: ${money(c.price||0)}</p><div style="display:flex;gap:7px;flex-wrap:wrap;"><button class="fcart-btn light" onclick="window.finalShowCompanyDetails('${c.id}')">View Details</button><button class="fcart-btn primary" onclick="window.finalShowVehicles('${c.id}')">Select</button></div><div id="details_${c.id}" style="display:none;margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;font-size:13px;color:#334155;line-height:1.5;">Fleet: ${esc(c.vehicleType||c.vehicle||'Fleet')}<br>Insurance: ${c.insurance?'Yes':'No'} • Licenses: ${c.verified?'Verified':'Pending'}<br>Live Tracking: Yes • Fragile: ${c.insurance?'Supported':'Limited'} • Express: ${/moto|fast|express/i.test(c.name||'')?'Yes':'Available'}</div></div>`;
  }

  window.openLogisticsMarketplaceFromCart = async function(){
    if(!readCart().length) return alert('Cart iko wazi.');
    ensureCartCSS();
    let m=document.getElementById('logisticsMarketplaceModal');
    if(!m){ m=document.createElement('div'); m.id='logisticsMarketplaceModal'; m.className='overlay-menu'; m.style.cssText='z-index:100009;display:none;background:rgba(15,23,42,.55);'; document.body.appendChild(m); }
    const pkg=pkgSummary();
    m.innerHTML=`<div class="lgx-final-shell"><div class="lgx-final-head"><div><h2> SokoHai Registered Logistics</h2><small>AI Suggestions • Sponsored Fair Match • Vehicle Selection • Back to Cart</small></div><button class="fcart-btn light" onclick="document.getElementById('logisticsMarketplaceModal').style.display='none'; window.openCart();">Back to Cart</button></div><div class="lgx-final-body"><div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:12px;margin-bottom:12px;"><b>Package:</b> ${pkg.weightKg}kg • ${pkg.sizeClass} • ${pkg.fragile?'Fragile':'Standard'} • Sellers ${pkg.sellersCount}</div><div class="lgx-final-toolbar"><input id="finalLgxSearch" placeholder="Search logistics..." oninput="window.finalFilterLogistics()"><select id="finalLgxSort" onchange="window.finalFilterLogistics()"><option value="score">Best Match</option><option value="price">Lowest Price</option><option value="rating">Highest Rating</option></select><button class="fcart-btn primary" onclick="window.finalFilterLogistics()">Filter</button></div><div id="finalLgxList" class="lgx-final-grid">Loading...</div><div id="finalVehicleList"></div></div></div>`;
    m.style.display='flex';
    window.__finalCompanies = await companies();
    window.finalFilterLogistics();
  };
  window.finalFilterLogistics=function(){
    const q=(document.getElementById('finalLgxSearch')?.value||'').toLowerCase(); const sort=document.getElementById('finalLgxSort')?.value||'score';
    let list=(window.__finalCompanies||[]).filter(c=>!q||String(c.name+' '+c.company+' '+c.coverageArea).toLowerCase().includes(q));
    if(sort==='price') list.sort((a,b)=>(a.price||0)-(b.price||0)); else if(sort==='rating') list.sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0)); else list.sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));
    document.getElementById('finalLgxList').innerHTML=list.map(companyCard).join('')||'<div class="lgx-final-card">Hakuna logistics inayofaa.</div>';
  };
  window.finalShowCompanyDetails=id=>{ const el=document.getElementById('details_'+id); if(el) el.style.display=el.style.display==='none'?'block':'none'; };
  window.finalShowVehicles=function(id){
    const c=(window.__finalCompanies||[]).find(x=>x.id===id); if(!c) return;
    const vs=vehiclesFor(c); const host=document.getElementById('finalVehicleList');
    host.innerHTML=`<div style="background:white;border:1px solid #e2e8f0;border-radius:18px;padding:14px;margin-top:12px;"><h3 style="margin:0 0 10px;color:#0f172a;">Vehicle Selection • ${esc(c.company||c.name)}</h3><div class="lgx-final-vehicles">${vs.map(v=>`<div class="lgx-final-vehicle"><b>${v.icon||''} ${v.type}</b><small style="display:block;color:#64748b;line-height:1.45;margin:5px 0;">Plate: ${v.plate||'After assignment'}<br>Capacity: ${v.capacityKg}kg • Status: Available<br>Insurance: ${v.insurance?'Yes':'No'} • ETA: ${v.eta}<br>Cost: ${money(v.cost)}</small><button class="fcart-btn primary" style="width:100%;" onclick="window.finalSelectVehicle('${id}','${v.id}')">Select Logistics</button></div>`).join('')}</div></div>`;
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  window.finalSelectVehicle=function(companyId,vehicleId){
    const c=(window.__finalCompanies||[]).find(x=>x.id===companyId); const v=vehiclesFor(c).find(x=>x.id===vehicleId); if(!c||!v) return;
    window.smartCartState = window.smartCartState || {};
    window.smartCartState.selectedCarrier = { ...c, selectedVehicle:v, vehicleType:v.type, vehicle:v.type, capacityKg:v.capacityKg, capacity:`${v.capacityKg} kg`, price:v.cost, eta:v.eta, plate:v.plate||'After assignment', insurance:v.insurance, marketplaceSelected:true };
    window.smartCartState.shippingService = c.service || 'sokohai_logistics'; window.smartCartState.shippingMethod = c.service || 'sokohai_logistics'; window.smartCartState.shippingCost = v.cost;
    alert(` Logistics Selected\n${c.company||c.name}\nVehicle: ${v.type}\nCost: ${money(v.cost)}\n\nUnarudi Cart.`);
    document.getElementById('logisticsMarketplaceModal').style.display='none'; window.openCart();
  };
  window.finalProceedCheckout=function(){
    const t=cartTotals(); if(!t.items.length) return alert('Cart iko wazi.'); if(!t.selected) return alert('Chagua delivery kwenye SokoHai Logistics Marketplace kabla ya Checkout.');
    if(typeof window.openSmartOrderReview==='function') return window.openSmartOrderReview();
    alert('Checkout package iko tayari kwa SokoPay.');
  };
})();

(function(){
  if(window.__SOKOHAI_MULTI_DELIVERY_CHAIN__) return;
  window.__SOKOHAI_MULTI_DELIVERY_CHAIN__ = true;

  const esc = s => typeof skh.skhEscape === 'function' ? skh.skhEscape(s||'') : String(s||'');
  const money = n => 'TSh ' + Number(n||0).toLocaleString();
  const rand = (p='TK') => p + '-' + Math.random().toString(36).slice(2,7).toUpperCase() + '-' + Math.floor(1000+Math.random()*9000);
  const cartItems = () => { try { return JSON.parse(skh.localStorage.getItem('sokohai_cart')||'[]') || []; } catch(e){ return window.myCart || []; } };
  const pkg = () => typeof skh.orchPackageSummary === 'function' ? skh.orchPackageSummary(cartItems()) : { weightKg:1, sizeClass:'small', fragile:false, hazardous:false, sellersCount:1 };
  const addr = () => window.smartCartState?.address || document.getElementById('smartShippingAddress')?.value || '';
  const pickup = () => cartItems()[0]?.sellerLocation || cartItems()[0]?.location || cartItems()[0]?.cartMeta?.pickupAddress || 'Seller Pickup';
  const selectedCarrier = () => window.smartCartState?.selectedCarrier || null;
  const setState = (k,v) => { window.smartCartState = window.smartCartState || {}; window.smartCartState[k]=v; };

  function recommendMulti(){
    const destination = String(addr()).toLowerCase();
    const p = pkg();
    const farWords = ['kigoma','mwanza','mbeya','rukwa','songwe','katavi','tabora','arusha','kilimanjaro','tanga','mtwara','lindi','geita','kagera','shinyanga','simiyu','manyara','dodoma','morogoro'];
    const far = farWords.some(w => destination.includes(w));
    const heavy = p.weightKg > 500;
    const multiSeller = p.sellersCount > 1;
    const recommended = far || heavy;
    return { recommended, reasons:[far?'Long-distance route detected':null, heavy?'Heavy/large cargo':null, multiSeller?'Multiple seller pickup coordination':null, p.fragile?'Fragile cargo needs controlled handover':null].filter(Boolean) };
  }

  function chooseHubPath(){
    const destination = String(addr()).toLowerCase();
    if(destination.includes('kigoma')) return ['Dar es Salaam Hub','Tabora Hub','Kigoma Local Delivery'];
    if(destination.includes('mbeya') || destination.includes('songwe')) return ['Dar es Salaam Hub','Morogoro Hub','Mbeya/Songwe Local Delivery'];
    if(destination.includes('mwanza')) return ['Dar es Salaam Hub','Dodoma/Manyoni Hub','Mwanza Local Delivery'];
    if(destination.includes('arusha') || destination.includes('kilimanjaro')) return ['Dar es Salaam Hub','Tanga/Moshi Hub','Arusha/Kilimanjaro Local Delivery'];
    if(destination.includes('morogoro')) return ['Dar es Salaam Hub','Morogoro Local Delivery'];
    return ['Pickup Hub','Regional Hub','Local Delivery'];
  }

  window.setCartDeliveryMode = function(mode){
    setState('deliveryMode', mode);
    if(typeof window.finalRenderCart === 'function') window.finalRenderCart();
  };

  // Wrap final cart render and inject delivery mode section without deleting existing cart UI.
  const oldFinalRenderCart = window.finalRenderCart || window.renderSmartCart;
  window.finalRenderCart = function(){
    if(oldFinalRenderCart) oldFinalRenderCart();
    const host = document.getElementById('smartShippingOrchestrationHost') || document.querySelector('.fcart-main .fcart-section:nth-child(2)');
    if(!host) return;
    const rec = recommendMulti();
    const mode = window.smartCartState?.deliveryMode || 'direct';
    const carrier = selectedCarrier();
    host.innerHTML = `<div class="orch-card"><div class="orch-title"><b> Delivery Selection</b><span class="scart-badge">Cart -> Logistics Marketplace -> Cart</span></div> <div class="orch-service-tabs" style="grid-template-columns:1fr 1fr;"><button class="${mode==='direct'?'active':''}" onclick="window.setCartDeliveryMode('direct')">Direct Delivery<br><small>One courier to buyer</small></button><button class="${mode==='multi'?'active':''}" onclick="window.setCartDeliveryMode('multi')">Multi Delivery (VIP)<br><small>Secure chain handover</small></button></div>
      ${rec.recommended?`<div class="orch-note"><b>AI Recommendation:</b> Multi Delivery recommended.<br>${rec.reasons.map(r=>' '+esc(r)).join('<br>')}</div>`:''}
      ${mode==='multi'?`<div class="cart-delivery-clean" style="margin-top:10px;"><b>Multi Delivery Secure Chain</b><br>Buyer follows one Master Shipment Token. Each stage uses Delivery Permission Token. No new identity verification; uses existing verified courier accounts + Token Center authorization.</div>`:''}
      ${carrier?`<div class="cart-delivery-clean" style="margin-top:10px;"><b>Selected Logistics:</b> ${esc(carrier.company||carrier.name)}<br><b>Vehicle:</b> ${esc(carrier.selectedVehicle?.type||carrier.vehicleType||carrier.vehicle||'—')} • <b>ETA:</b> ${esc(carrier.eta||'—')}<br><b>Shipping Cost:</b> ${money(carrier.price||0)} • <b>Insurance:</b> ${carrier.insurance?'Yes':'No'} • <b>Tracking:</b> Available<br><b>Delivery Mode:</b> ${mode==='multi'?'Multi Delivery with Secure Handover':'Direct Delivery'}</div>`:`<div class="cart-delivery-empty" style="margin-top:10px;"><b>Delivery not selected yet.</b><br>Open SokoHai Logistics Marketplace and choose company + vehicle.</div>`}
      <button class="fcart-btn primary full" onclick="window.openLogisticsMarketplaceFromCart()"> Select Delivery / Open SokoHai Logistics</button> </div>`;
  };
  window.renderSmartCart = window.finalRenderCart;

  function buildMultiStages(core, carrier){
    const hubs = chooseHubPath();
    const master = rand('SH');
    const shipmentId = rand('SHPID');
    const trackingId = rand('TRK');
    const stages = [];
    if((window.smartCartState?.deliveryMode || 'direct') === 'multi'){
      for(let i=0;i<hubs.length-1;i++){
        stages.push({
          stageNumber:i+1,
          fromHub:hubs[i],
          toHub:hubs[i+1],
          courierId:i===0?(carrier?.id||'selected_courier'):'waiting_buyer_continue_delivery',
          courierName:i===0?(carrier?.company||carrier?.name||'Selected Courier'):'Waiting next courier',
          status:i===0?'active':'waiting_previous_stage',
          deliveryPermissionToken:rand('DLV-'+String.fromCharCode(65+i)),
          pickupToken:rand('PU-'+(i+1)),
          transportToken:rand('TR-'+(i+1)),
          arrivalToken:rand('AR-'+(i+1)),
          handoverToken:rand('HO-'+(i+1)),
          expiryAt:new Date(Date.now()+24*3600000).toISOString(),
          oneTime:true,
          used:false
        });
      }
    } else {
      stages.push({
        stageNumber:1, fromHub:pickup(), toHub:addr()||'Buyer', courierId:carrier?.id||'selected_courier', courierName:carrier?.company||carrier?.name||'Selected Courier', status:'active',
        deliveryPermissionToken:rand('DLV-A'), pickupToken:rand('PU-1'), transportToken:rand('TR-1'), arrivalToken:rand('AR-1'), handoverToken:rand('HO-1'), expiryAt:new Date(Date.now()+24*3600000).toISOString(), oneTime:true, used:false
      });
    }
    return { masterShipmentToken:master, shipmentId, trackingId, stages };
  }

  async function saveStageTokensToTokenCenter(coreId, plan, shipmentDocId){
    for(const st of plan.stages){
      const payload = {
        token: st.deliveryPermissionToken,
        tokenType:'delivery_permission',
        tokenCategory:'authorization_not_identity',
        masterShipmentToken:plan.masterShipmentToken,
        shipmentId:plan.shipmentId,
        shipmentDocId,
        sokopayCoreId:coreId,
        stageNumber:st.stageNumber,
        courierId:st.courierId,
        courierName:st.courierName,
        pickupHub:st.fromHub,
        destinationHub:st.toHub,
        expiryAt:st.expiryAt,
        oneTime:true,
        used:false,
        status:st.status==='active'?'active':'waiting',
        verificationEngine:'reuse_existing_sokohai_verification',
        createdAt:new Date().toISOString()
      };
      await skh.addDoc(skh.collection(skh.db,'sokopay_tokens'), payload).catch(()=>{});
    }
  }

  // Override checkout to attach multi-stage plan and Token Center entries, preserving core engine.
  const oldConfirm = window.confirmSmartCartOrder;
  window.confirmSmartCartOrder = async function(){
    const carrier = selectedCarrier();
    if(!carrier) return alert('Chagua delivery kwenye SokoHai Logistics Marketplace kabla ya checkout.');
    // If previous implementation exists, use it? We need inject stage tokens after its records are created. Simpler: call old then augment pending core IDs.
    await oldConfirm();
    let ids=[]; try{ ids=JSON.parse(sessionStorage.getItem('pending_sokopay_core_ids')||'[]'); }catch(e){}
    for(const coreId of ids){
      try{
        const snap = await skh.getDoc(skh.doc(skh.db,'sokopay_core_transactions',coreId));
        if(!snap.exists()) continue;
        const core = { id:coreId, ...snap.data() };
        if(core.masterShipmentToken) continue;
        const plan = buildMultiStages(core, carrier);
        let shipmentDocId = core.shipmentDocId || '';
        if(shipmentDocId){
          await skh.updateDoc(skh.doc(skh.db,'shipments',shipmentDocId), { deliveryMode:window.smartCartState?.deliveryMode||'direct', masterShipmentToken:plan.masterShipmentToken, shipmentId:plan.shipmentId, trackingId:plan.trackingId, stages:plan.stages, chainOfCustody:[], updatedAt:new Date().toISOString() }).catch(()=>{});
        }
        await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',coreId), { deliveryMode:window.smartCartState?.deliveryMode||'direct', masterShipmentToken:plan.masterShipmentToken, shipmentId:plan.shipmentId, trackingId:plan.trackingId, stageTokens:plan.stages.map(s=>({stageNumber:s.stageNumber, token:s.deliveryPermissionToken, status:s.status, from:s.fromHub, to:s.toHub})), tokenCenter:'sokopay_tokens', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:'Delivery Tokens Generated',description:'Master shipment token and stage delivery permission tokens created via Token Center.',at:new Date().toISOString(),done:true}) }).catch(()=>{});
        await saveStageTokensToTokenCenter(coreId, plan, shipmentDocId);
      }catch(e){ console.log('multi delivery augmentation failed', coreId, e); }
    }
  };

  // Token Center: verify delivery permission tokens before older token checks.
  const oldVerifyToken = window.verifyLogisticsToken;
  window.verifyLogisticsToken = async function(){
    const input = document.getElementById('logisticsTokenInput');
    const token = input?.value?.trim()?.toUpperCase();
    if(!token) return oldVerifyToken ? oldVerifyToken() : alert('Weka token.');
    const resultBox=document.getElementById('logisticsTokenResult'); const btnVerify=document.getElementById('btnVerifyLogisticsToken'); const btnRelease=document.getElementById('btnReleaseCargoToken');
    try{
      const qTok=skh.query(skh.collection(skh.db,'sokopay_tokens'), skh.where('token','==',token), skh.where('tokenType','==','delivery_permission'), skh.limit(1));
      const snap=await skh.getDocs(qTok);
      if(!snap.empty){
        const d=snap.docs[0]; const t=d.data();
        const expired = t.expiryAt && new Date(t.expiryAt).getTime()<Date.now();
        if(expired || t.used) { resultBox.innerHTML=`<b style="color:#e11d48;">ACCESS DENIED</b><br>Token expired or already used.`; resultBox.style.display='block'; return; }
        sessionStorage.setItem('active_verified_ride_id', d.id);
        sessionStorage.setItem('active_verified_token_type', 'delivery_permission_token');
        sessionStorage.setItem('active_verified_token_value', token);
        resultBox.innerHTML = `<div style="font-size:13px;line-height:1.55;text-align:left;"><b style="color:#10b981;font-size:14px;"> DELIVERY PERMISSION TOKEN VALID</b><br><b>Master:</b> ${esc(t.masterShipmentToken)}<br><b>Shipment:</b> ${esc(t.shipmentId)}<br><b>Stage:</b> ${t.stageNumber} • ${esc(t.pickupHub)} -> ${esc(t.destinationHub)}<br><b>Courier:</b> ${esc(t.courierName||t.courierId)}<br><small>Identity verification is reused from existing SokoHai Verification Engine. This token is authorization only.</small></div>`;
        resultBox.style.display='block'; if(btnVerify) btnVerify.style.display='none'; if(btnRelease) btnRelease.style.display='block'; return;
      }
    }catch(e){ console.log('delivery permission token lookup skipped', e); }
    return oldVerifyToken ? oldVerifyToken() : null;
  };

  // Token Center release for delivery permission tokens.
  const oldRelease = window.releaseCargoWithToken;
  window.releaseCargoWithToken = async function(){
    const type = sessionStorage.getItem('active_verified_token_type');
    if(type !== 'delivery_permission_token') return oldRelease ? oldRelease() : null;
    const tokenDocId = sessionStorage.getItem('active_verified_ride_id');
    const btnRelease=document.getElementById('btnReleaseCargoToken'); if(btnRelease){ btnRelease.disabled=true; btnRelease.innerText=' Confirming...'; }
    try{
      const ref=skh.doc(skh.db,'sokopay_tokens',tokenDocId);
      const snap=await skh.getDoc(ref); if(!snap.exists()) throw new Error('Token not found');
      const t=snap.data();
      if(t.used) throw new Error('Token already used');
      // Reuse existing verification: user must be logged in; no new identity verification module.
      if(!skh.currentUser) throw new Error('Courier must be logged in with existing verified SokoHai account');
      await skh.updateDoc(ref, { used:true, status:'used', usedBy:skh.currentUser.uid, usedAt:new Date().toISOString(), handoverGPSStatus:'captured_by_tracking_engine' });
      if(t.shipmentDocId){
        const shipRef=skh.doc(skh.db,'shipments',t.shipmentDocId);
        const shipSnap=await skh.getDoc(shipRef); const ship=shipSnap.exists()?shipSnap.data():{};
        const stages=(ship.stages||[]).map(s=> s.stageNumber===t.stageNumber ? {...s,status:'completed',used:true,completedAt:new Date().toISOString(),completedBy:skh.currentUser.uid} : (s.stageNumber===t.stageNumber+1 && s.status==='waiting_previous_stage' ? {...s,status:'active'} : s));
        await skh.updateDoc(shipRef, { stages, status: stages.every(s=>s.status==='completed')?'Delivered':'Stage '+t.stageNumber+' Completed', chainOfCustody:skh.arrayUnion({stageNumber:t.stageNumber, token:t.token, courierId:skh.currentUser.uid, pickupHub:t.pickupHub, destinationHub:t.destinationHub, completedAt:new Date().toISOString()}), updatedAt:new Date().toISOString() }).catch(()=>{});
      }
      if(t.sokopayCoreId){
        await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',t.sokopayCoreId), { shipmentStatus:'Stage '+t.stageNumber+' Completed', updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({title:'Stage '+t.stageNumber+' Completed',description:`${t.pickupHub} -> ${t.destinationHub} handover verified by Delivery Permission Token.`,at:new Date().toISOString(),done:true}), shippingEscrowReleases:skh.arrayUnion({stageNumber:t.stageNumber,status:'eligible_for_stage_release',at:new Date().toISOString()}) }).catch(()=>{});
      }
      alert(' Stage handover imethibitishwa. Cargo released for this stage.');
      closeModals();
    }catch(e){ alert('Token release failed: '+e.message); }
    finally{ if(btnRelease){ btnRelease.disabled=false; btnRelease.innerText=' THIBITISHA KUTOA / KUKABIDHI MZIGO'; } }
  };
})();

(function injectSokoHaiGlobalUXCSS(){
    const css = `
    :root { --skh-bottom-safe: 96px; }
    body { padding-bottom: 150px !important; }

    /* Keyboard/input mode: bottom nav must not cover inputs */
    body.skh-keyboard-open .bottom-area-wrapper,
    body.skh-keyboard-open .bottom-nav-main,
    body.skh-keyboard-open .sub-slider-nav,
    body.skh-keyboard-open .sell-action-fab {
        display:none !important;
        pointer-events:none !important;
    }
    body.skh-keyboard-open { padding-bottom: 20px !important; }

    /* All modals/forms get safe lower padding */
    .overlay-menu { padding-bottom: env(safe-area-inset-bottom) !important; }
    .overlay-menu > div,
    .form-box,
    #productModal > div,
    #cartModal > div,
    #checkoutModal > div {
        max-height: calc(100vh - 24px) !important;
        box-sizing: border-box !important;
    }
    .form-box,
    .overlay-menu textarea,
    .overlay-menu input,
    .overlay-menu select {
        scroll-margin-bottom: 140px !important;
    }
    textarea:focus, input:focus, select:focus {
        outline: 2px solid rgba(0,80,157,.18) !important;
        outline-offset: 1px !important;
    }

    /* Universal visible back button */
    .skh-global-back-btn {
        position: fixed;
        top: calc(10px + env(safe-area-inset-top));
        left: 10px;
        z-index: 10000250;
        min-height: 38px;
        padding: 8px 13px;
        border: none;
        border-radius: 999px;
        background: rgba(15,23,42,.92);
        color: #fff;
        font-size: 12px;
        font-weight: 950;
        box-shadow: 0 8px 22px rgba(0,0,0,.22);
        cursor: pointer;
        display: none;
        align-items: center;
        gap: 6px;
    }
    .skh-global-back-btn.show { display: inline-flex !important; }
    .skh-inline-back-btn {
        width: 100%;
        min-height: 42px;
        border: none;
        border-radius: 13px;
        background: #eef2f7;
        color: #0f172a;
        font-weight: 950;
        font-size: 12px;
        cursor: pointer;
        margin: 8px 0 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
    }

    /* Chat/comment compose areas should always be above nav */
    .chat-input-area,
    .comments-section,
    #actionRequestModal .form-box,
    #sellerForm,
    #printingServiceModal .prt-pro-body,
    #cartModal .scart-side,
    #cartModal .fcart-side {
        padding-bottom: calc(18px + env(safe-area-inset-bottom)) !important;
    }

    /* Friendlier marketplace/service/job/transport cards */
    .feed-card-box, .large-card, .dash-item, .cargo-card-pro, .ct-inventory-card,
    .menu-item-new, .mode-tab-btn, .cat-trigger-btn, .filter-chip, .subcat-chip {
        touch-action: manipulation;
    }
    .feed-card-box { border-radius: 16px !important; box-shadow: 0 5px 14px rgba(15,23,42,.06) !important; }
    .feed-info-box b { font-size: 13px !important; line-height: 1.25 !important; }
    /* [R8 MOBILE CARDS] Bei 16px — spec ya kadi (readable kwenye 360/390/412). old: 15px. */
    .feed-info-box .price { font-size: 16px !important; }
    .mode-tab-btn { min-height: 36px !important; padding: 9px 14px !important; }
    .cat-trigger-btn { min-height: 48px !important; }

    .skh-friendly-section-card {
        background: linear-gradient(135deg,#ffffff,#f8fafc);
        border: 1px solid #e2e8f0;
        border-left: 5px solid #00509d;
        border-radius: 16px;
        padding: 12px 14px;
        margin: 10px 15px;
        box-shadow: 0 5px 14px rgba(15,23,42,.04);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
    }
    .skh-friendly-section-card b { color:#0f172a; font-size: 13px; display:block; }
    .skh-friendly-section-card small { color:#64748b; font-size:12.5px; display:block; margin-top:2px; }
    .skh-friendly-section-card button {
        border:none; background:#18A982; color:white; border-radius:12px; min-height:36px; padding:8px 12px; font-weight:900; font-size:12.5px;
    }

    @media(max-width:520px){
        body { padding-bottom: 120px !important; }
        .skh-global-back-btn { top: 8px; left: 8px; min-height: 34px; padding: 7px 10px; font-size:13px; }
        .overlay-menu > div, .form-box { width: 96% !important; }
        .feed-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
        .main-feed { padding: 0 10px !important; }
        .skh-friendly-section-card { margin: 8px 10px; padding: 11px 12px; }
    } `;
    const st = document.createElement('style');
    st.id = 'sokohaiGlobalUXCSS';
    st.textContent = css;
    document.head.appendChild(st);
})();
