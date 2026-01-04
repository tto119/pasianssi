// Klondyke solitaire - basic implementation (click-to-select moves)
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A", "2","3","4","5","6","7","8","9","10","J","Q","K"];

function createDeck(){
  const deck = [];
  for(const s of SUITS) for(const r of RANKS) deck.push({suit:s,rank:r});
  return deck;
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

// Game state
const state = {
  stock:[], waste:[], foundations:[[],[],[],[]], table: [[],[],[],[],[],[],[]],
  selected:null, // {zone:'table'|'waste'|'foundation', idx:..., cardIdx:...}
  history:[], score:0
}

// Queue of pile indices to animate flips for after render
const pendingFlips = [];

// DOM refs
const stockEl = document.getElementById('stock');
const wasteEl = document.getElementById('waste');
const foundationsEl = document.getElementById('foundations');
const tableauEl = document.getElementById('tableau');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGame');
const undoBtn = document.getElementById('undo');
const autoMoveBtn = document.getElementById('autoMove');

if(newGameBtn){
  newGameBtn.addEventListener('click', startGame);
} else {
  console.error('newGame button not found');
}
if(undoBtn){
  undoBtn.addEventListener('click', undo);
} else {
  console.error('undo button not found');
}
if(stockEl){
  stockEl.addEventListener('click', drawFromStock);
} else {
  console.error('stock element not found');
}
if(autoMoveBtn){
  autoMoveBtn.addEventListener('click', autoMoveAllToFoundations);
} else {
  console.warn('autoMove button not found');
}

// Initialize
console.log('main.js loaded');
startGame();

function startGame(){
  console.log('startGame called');
  // reset
  const deck = createDeck(); shuffle(deck);
  state.stock = deck.slice(); state.waste=[]; state.foundations=[[],[],[],[]]; state.table=[[],[],[],[],[],[],[]]; state.history=[]; state.score=0; state.selected=null;

  // deal tableau: 1..7 cards, last face-up in each pile
  for(let i=0;i<7;i++){
    for(let j=0;j<=i;j++){
      const c = state.stock.pop();
      state.table[i].push({card:c, faceUp: j===i});
    }
  }

  render();
}

function render(){
  // stock
  stockEl.innerHTML = state.stock.length? `<div class="card face-down"></div>` : '';
  // waste
  wasteEl.innerHTML = state.waste.length? cardHtml(state.waste[state.waste.length-1]) : '';
  // foundations
  foundationsEl.querySelectorAll('.foundation').forEach((el, idx)=>{
    const f = state.foundations[idx]; el.innerHTML = f.length? cardHtml(f[f.length-1]) : '';
  });
  // tableau
  tableauEl.querySelectorAll('.pile').forEach((el, idx)=>{
    const pile = state.table[idx]; el.innerHTML = '';
    // stack cards top-to-bottom with overlap
    const offset = 24; // vertical gap between cards (increased for better visibility)
    el.style.minHeight = Math.max(260, (pile.length - 1) * offset + 96) + 'px';
    pile.forEach((slot, sidx)=>{
      const node = document.createElement('div');
      node.className = 'card ' + (slot.faceUp? (isRed(slot.card)?'red':'black') : 'face-down');
      // position overlapping
      node.style.position = 'absolute';
      node.style.left = '0px';
      node.style.top = (sidx * offset) + 'px';
      node.style.zIndex = sidx;

      if(slot.faceUp){
        node.innerHTML = `<div class="rank">${slot.card.rank}</div><div class="suit">${slot.card.suit}</div>`;
        node.addEventListener('click', ()=> onTableCardClick(idx, sidx));
        node.addEventListener('dblclick', ()=> onTableCardDblClick(idx, sidx));
        node.addEventListener('pointerdown', (e)=> onCardPointerDown(idx, sidx, e));


      }
      el.appendChild(node);
    });
    // allow clicking empty pile (ignore clicks that originated on a card)
    el.onclick = (e)=> { if(e.target.closest('.card')) return; onEmptyTableClick(idx, e); };
  });

  // update selection highlight
  document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));
  if(state.selected){
    if(state.selected.zone==='waste') wasteEl.querySelector('.card')?.classList.add('selected');
    if(state.selected.zone==='table'){
      const pile = tableauEl.querySelectorAll('.pile')[state.selected.idx];
      const cardNode = pile.children[state.selected.cardIdx]; if(cardNode) cardNode.classList.add('selected');
    }
  }

  scoreEl.textContent = `Pisteet: ${state.score}`;
  undoBtn.disabled = state.history.length===0;

  // After render, run any queued flip animations
  processPendingFlips();
}

function processPendingFlips(){
  if(!pendingFlips.length) return;
  const toAnimate = Array.from(new Set(pendingFlips.splice(0, pendingFlips.length)));
  // Schedule animation to next frame so DOM updates/paint have completed
  requestAnimationFrame(()=>{
    // force layout so the browser paints the newly revealed card(s) before animating
    void tableauEl.offsetHeight;
    toAnimate.forEach(pileIdx => {
      const pileEl = tableauEl.querySelectorAll('.pile')[pileIdx];
      if(!pileEl) return;
      const cardNodes = pileEl.querySelectorAll('.card');
      if(!cardNodes.length) return;
      const node = cardNodes[cardNodes.length - 1];
      // prepare for animation
      node.style.willChange = 'transform';
      node.style.transform = 'rotateY(180deg)';
      requestAnimationFrame(()=>{
        node.classList.add('flip-anim');
        node.style.transform = '';
        node.addEventListener('transitionend', function te(){ node.classList.remove('flip-anim'); node.style.willChange = ''; node.removeEventListener('transitionend', te); });
      });
    });
  });
}

function cardHtml(c){ 
      return `
        <div class="card ${isRed(c)?'red':'black'}">
          <div class="rank">${c.rank}</div>
          <div class="suit-large">${c.suit}</div>
          <div class="suit" style="align-self: flex-end; transform: rotate(180deg)">${c.suit}</div>
        </div>` 
    }
function isRed(c){ return c.suit==='♥' || c.suit==='♦' }

function drawFromStock(){
  if(state.stock.length===0){
    // recycle waste
    state.stock = state.waste.reverse().map(c=>c); state.waste=[]; state.history.push({type:'recycle'});
  } else {
    const c = state.stock.pop(); state.waste.push(c); state.history.push({type:'draw',card:c});
  }
  state.selected=null; render();
}

function onTableCardClick(pileIdx, cardIdx){
  // ignore clicks while an active drag is in progress
  if(dragState && dragState.dragging) return;
  const pile = state.table[pileIdx]; const slot = pile[cardIdx];
  if(!slot.faceUp) return; // cannot select facedown

  // If there's already a selection, attempt to move it to this pile
  if(state.selected){
    // clicking the same selected card toggles selection off
    if(state.selected.zone==='table' && state.selected.idx===pileIdx && state.selected.cardIdx===cardIdx){
      state.selected = null; render(); return;
    }
    if(state.selected.zone==='waste'){
      moveWasteToTable(pileIdx); return;
    }
    if(state.selected.zone==='table'){
      moveTableToTable(state.selected.idx, state.selected.cardIdx, pileIdx); return;
    }
  }

  // selecting a card sequence
  state.selected = {zone:'table', idx:pileIdx, cardIdx}; render();
}

function onEmptyTableClick(pileIdx, e){
  // if a selection exists, try to move there
  if(!state.selected) return;
  if(state.selected.zone==='table'){
    moveTableToTable(state.selected.idx, state.selected.cardIdx, pileIdx);
  } else if(state.selected.zone==='waste'){
    moveWasteToTable(pileIdx);
  }
}

// Click on waste to select
wasteEl.addEventListener('click', ()=>{
  if(state.waste.length===0) return;
  // ignore click selection while dragging
  if(dragState && dragState.dragging) return;
  state.selected = {zone:'waste'}; render();
});
// double-click to move waste top card to foundation
wasteEl.addEventListener('dblclick', ()=>{ autoMoveWasteToFoundation(); });
// Pointer down on waste to start drag
wasteEl.addEventListener('pointerdown', (e)=> onWastePointerDown(e));

// foundations clickable (move selected to foundations)
foundationsEl.addEventListener('click', (e)=>{
  const fEl = e.target.closest('.foundation'); if(!fEl) return;
  const idx = Number(fEl.dataset.index);
  if(state.selected?.zone==='waste') moveWasteToFoundation(idx);
  if(state.selected?.zone==='table') moveTableToFoundation(state.selected.idx, state.selected.cardIdx, idx);
});

// --- Drag & drop (pointer-based) ---
let dragState = null;
const DRAG_THRESHOLD = 6;
function onCardPointerDown(pileIdx, cardIdx, e){
  const pile = state.table[pileIdx];
  const slot = pile[cardIdx];
  if(!slot || !slot.faceUp) return;
  // prepare drag state
  dragState = {from:'table', pileIdx, cardIdx, seq: pile.slice(cardIdx), startX:e.clientX, startY:e.clientY, dragging:false, layer:null, removed:null};
  // clear any visible selection immediately so dragging doesn't show selections
  state.selected = null; document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));
  // also clear any native selection ranges and blur focused elements to avoid persistent highlights
  try{ window.getSelection()?.removeAllRanges(); }catch(e){}
  try{ document.activeElement?.blur(); }catch(e){}
  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerUp);
  e.target.setPointerCapture?.(e.pointerId);
}
function onWastePointerDown(e){
  if(state.waste.length===0) return;
  dragState = {from:'waste', pileIdx:null, cardIdx:null, seq:[{card:state.waste[state.waste.length-1], faceUp:true}], startX:e.clientX, startY:e.clientY, dragging:false, layer:null, removed:null};
  // clear selection immediately
  state.selected = null; document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));
  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerUp);
  e.target.setPointerCapture?.(e.pointerId);
}
function beginDrag(){
  if(!dragState || dragState.dragging) return;
  dragState.dragging = true;
  const layer = document.createElement('div');
  layer.className = 'drag-layer';
  document.body.appendChild(layer);
  dragState.layer = layer;
  dragState.seq.forEach((slot, i)=> {
    const clone = document.createElement('div');
    clone.className = 'drag-clone card ' + (isRed(slot.card)?'red':'black');
    clone.innerHTML = `<div class="rank">${slot.card.rank}</div><div class="suit">${slot.card.suit}</div>`;
    clone.style.top = (i*24)+'px';
    clone.style.left = '0px';
    clone.style.zIndex = 2000 + i;
    layer.appendChild(clone);
  });

  // Tyhjennetään valinta
  state.selected = null;
  document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));

  // Poistetaan VAIN siirrettävät kortit lähdepakasta
  if(dragState.from==='table'){
    const pileIdx = dragState.pileIdx;
    const cardIdx = dragState.cardIdx;
    const removedCards = state.table[pileIdx].slice(cardIdx);
    
    dragState.removed = {type:'table', pileIdx, cardIdx, removedCards};
    state.table[pileIdx] = state.table[pileIdx].slice(0, cardIdx);
    
    render();
    void tableauEl.offsetHeight;
  } else if(dragState.from==='waste'){
    const card = state.waste.pop();
    dragState.removed = {type:'waste', card};
    render();
  }
}
function onDragPointerMove(e){
  if(!dragState) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if(!dragState.dragging && Math.hypot(dx,dy) > DRAG_THRESHOLD) beginDrag();
  if(dragState.dragging){
     dragState.layer.style.transform = `translate(${e.clientX - 36}px, ${e.clientY - 48}px)`;
     // highlight targets
     document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
     const el = document.elementFromPoint(e.clientX, e.clientY);
     const pileEl = el?.closest('.pile');
     if(pileEl){
       const piles = Array.from(tableauEl.querySelectorAll('.pile'));
       const idx = piles.indexOf(pileEl);
       if(idx >= 0){
         const firstCard = dragState.seq[0].card;
         if(canPlaceOnTable(firstCard, state.table[idx])) pileEl.classList.add('drop-target');
       }
     }
     // if not a tableau pile, check foundations
     const fEl = el?.closest('.foundation');
     if(fEl && dragState.seq.length===1){
       const idx = Number(fEl.dataset.index);
       const card = dragState.seq[0].card;
       if(canPlaceOnFoundation(card, state.foundations[idx])) fEl.classList.add('drop-target');
     }
  }
}
function onDragPointerUp(e){
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerUp);
  if(!dragState) return;
  if(dragState.dragging){
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pileEl = el?.closest('.pile');
    let moved=false;

    if(pileEl){
      const piles = Array.from(tableauEl.querySelectorAll('.pile'));
      const idx = piles.indexOf(pileEl);
      if(idx >= 0){
        // Finalize move using the temporarily-removed cards stored in dragState.removed
        if(dragState.from==='table'){
          const removed = dragState.removed;
          const seq = removed?.removedCards || dragState.seq;
          const firstCard = seq[0].card;
          if(canPlaceOnTable(firstCard, state.table[idx])){
            state.history.push({type:'move',from:{zone:'table',idx:removed.pileIdx,cardIdx:removed.cardIdx},to:{zone:'table',idx},cards:seq.map(s=>s.card)});
            state.table[idx] = state.table[idx].concat(seq);
            // If we had temporarily removed an underneath facedown card, place it back and flip it now
            if(removed.underneath){
              removed.underneath.faceUp = true;
              state.table[removed.pileIdx].push(removed.underneath);
              pendingFlips.push(removed.pileIdx);
            }
            state.selected = null; state.score += 5; moved = true;
          } else {
            // invalid drop: do nothing here, we'll restore after checking moved flag
          }
        } else if(dragState.from==='waste'){
          const card = dragState.removed.card;
          if(canPlaceOnTable(card, state.table[idx])){
            state.history.push({type:'move',from:'waste',to:{zone:'table',idx},card});
            state.table[idx].push({card, faceUp:true});
            state.selected=null; moved=true;
          } else {
            // restore to waste
            state.waste.push(card);
          }
        }
      }
    } else {
      const fEl = el?.closest('.foundation');
      if(fEl && dragState.seq.length===1){
        const idx = Number(fEl.dataset.index);
        if(dragState.from==='table'){
          const removed = dragState.removed;
          const card = removed?.removedCards[0].card || dragState.seq[0].card;
          if(canPlaceOnFoundation(card, state.foundations[idx])){
            state.history.push({type:'move',from:{zone:'table',idx:removed.pileIdx},to:{zone:'foundation',idx},card});
            state.foundations[idx].push(card);
            // If we had temporarily removed an underneath facedown card, place it back and flip it now
            if(removed.underneath){
              removed.underneath.faceUp = true;
              state.table[removed.pileIdx].push(removed.underneath);
              pendingFlips.push(removed.pileIdx);
            }
            state.selected=null; state.score+=10; moved=true;
          } else {
            // invalid drop: do nothing here, we'll restore after checking moved flag
          }
        } else if(dragState.from==='waste'){
          const card = dragState.removed.card;
          if(canPlaceOnFoundation(card, state.foundations[idx])){
            state.history.push({type:'move',from:'waste',to:{zone:'foundation',idx},card});
            state.foundations[idx].push(card); state.selected=null; state.score+=10; moved=true;
          } else {
            state.waste.push(card);
          }
        }
      }
    }

    // remove highlights
    document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));

        // Jos siirto onnistui ja paljastimme aiemmin piilossa olleen kortin, käänetään se
        if(moved && dragState.from === 'table'){
          const sourcePile = state.table[dragState.pileIdx];
          const last = sourcePile[sourcePile.length - 1];
          if(last && !last.faceUp){
            last.faceUp = true;
            last.wasAutoFlipped = true;
            pendingFlips.push(dragState.pileIdx);
          }
        }

        // Jos drag peruttiin (ei validia siirtoa), palautetaan kortit alkuperäiseen paikkaan
        if(dragState.removed && !moved){
          if(dragState.removed.type === 'table'){
            const r = dragState.removed;
            state.table[r.pileIdx] = state.table[r.pileIdx].concat(r.removedCards);
          } else if(dragState.removed.type === 'waste'){
            state.waste.push(dragState.removed.card);
          }
        }

        // cleanup layer and re-render final state
        dragState.layer.remove(); dragState=null; render();

    // also clear any native selection ranges and blur focused elements to remove lingering highlights
    try{ window.getSelection()?.removeAllRanges(); }catch(e){}
    try{ document.activeElement?.blur(); }catch(e){}
  } else {
    // no drag initiated - treat as click selection
    if(dragState.removed){
      // restore DOM by re-rendering
      dragState.layer?.remove(); dragState=null; render();
      return;
    }
    // capture info, clear dragState, then perform click action so handlers see no drag in progress
    const tmp = dragState; dragState = null;
    if(tmp.from==='table'){
      onTableCardClick(tmp.pileIdx, tmp.cardIdx);
    } else if(tmp.from==='waste'){
      if(state.waste.length) { state.selected = {zone:'waste'}; render(); }
    }
  }
}

function moveWasteToTable(pileIdx){
  const c = state.waste[state.waste.length-1];
  if(canPlaceOnTable(c, state.table[pileIdx])){
    state.history.push({type:'move',from:'waste',to:{zone:'table',idx:pileIdx},card:c});
    state.waste.pop(); state.table[pileIdx].push({card:c, faceUp:true});
    state.selected=null; render();
  }
}

function moveWasteToFoundation(fIdx){
  const c = state.waste[state.waste.length-1];
  if(canPlaceOnFoundation(c, state.foundations[fIdx])){
    state.history.push({type:'move',from:'waste',to:{zone:'foundation',idx:fIdx},card:c});
    state.waste.pop(); state.foundations[fIdx].push(c); state.selected=null; state.score+=10; render();
  } else {
    console.log('moveWasteToFoundation denied:', c, '->', state.foundations[fIdx]);
  }
}

function moveTableToFoundation(fromPile, cardIdx, fIdx){
  const slice = state.table[fromPile].slice(cardIdx).map(s=>s.card);
  if(slice.length!==1) return; // only single top card to foundation
  const c = slice[0];
  if(canPlaceOnFoundation(c, state.foundations[fIdx])){
    state.history.push({type:'move',from:{zone:'table',idx:fromPile},to:{zone:'foundation',idx:fIdx},card:c});
    state.table[fromPile].pop(); // remove last
    // flip last card if necessary and queue animation
    const last = state.table[fromPile][state.table[fromPile].length-1];
if(last && !last.faceUp) {
    last.faceUp = true;
    last.wasAutoFlipped = true; // Merkitse muistiin undo-toimintoa varten
    pendingFlips.push(fromPile);
}
    state.foundations[fIdx].push(c); state.selected=null; state.score+=10; render();
  } else {
    console.log('moveTableToFoundation denied:', c, '->', state.foundations[fIdx]);
  }
}

// Auto-move helpers: find a valid foundation index for a card
function findFoundationIndex(card){
  for(let i=0;i<4;i++) if(canPlaceOnFoundation(card, state.foundations[i])) return i;
  return -1;
}
function autoMoveWasteToFoundation(){
  if(state.waste.length===0) return false;
  const c = state.waste[state.waste.length-1];
  const idx = findFoundationIndex(c);
  if(idx>=0){ moveWasteToFoundation(idx); return true; }
  return false;
}
function autoMoveTableTopToFoundation(){
  for(let i=0;i<7;i++){
    const pile = state.table[i];
    if(pile.length===0) continue;
    const top = pile[pile.length-1];
    if(!top.faceUp) continue;
    const card = top.card;
    const idx = findFoundationIndex(card);
    if(idx>=0){ moveTableToFoundation(i, pile.length-1, idx); return true; }
  }
  return false;
}
function autoMoveAllToFoundations(){
  let moved = false;
  let progress = true;
  while(progress){
    progress = false;
    while(autoMoveWasteToFoundation()){ progress = moved = true; }
    if(autoMoveTableTopToFoundation()){ progress = moved = true; }
  }
  if(moved) console.log('auto-move completed'); else console.log('auto-move: no moves available');
}

// double-click handler for table cards to auto-move the top card to foundation
function onTableCardDblClick(pileIdx, cardIdx){
  const pile = state.table[pileIdx]; if(cardIdx !== pile.length-1) return; // only top card
  const top = pile[pile.length-1]; if(!top.faceUp) return;
  const idx = findFoundationIndex(top.card);
  if(idx>=0) moveTableToFoundation(pileIdx, cardIdx, idx);
}


function moveTableToTable(fromPile, cardIdx, toPile){
  const seq = state.table[fromPile].slice(cardIdx);
  const seqCards = seq.map(s=>s.card);
  if(!canPlaceOnTable(seqCards[0], state.table[toPile])) return;
  state.history.push({type:'move',from:{zone:'table',idx:fromPile,cardIdx},to:{zone:'table',idx:toPile},cards:seq.map(s=>s.card)});
  // move
  state.table[toPile] = state.table[toPile].concat(seq);
  state.table[fromPile] = state.table[fromPile].slice(0,cardIdx);
  // flip
  const last = state.table[fromPile][state.table[fromPile].length-1]; if(last && !last.faceUp) last.faceUp=true;
  state.selected=null; state.score+=5; render();
}

function canPlaceOnTable(card, destPile){
  if(destPile.length===0) return card.rank==='K';
  const top = destPile[destPile.length-1].card;
  const colorsDiffer = (isRed(card)!==isRed(top));
  return colorsDiffer && rankValue(card.rank) + 1 === rankValue(top.rank);
}

function canPlaceOnFoundation(card, foundation){
  if(foundation.length===0) return card.rank==='A';
  const top = foundation[foundation.length-1];
  return card.suit===top.suit && rankValue(card.rank) === rankValue(top.rank)+1;
}

function rankValue(r){ if(r==='A') return 1; if(r==='J') return 11; if(r==='Q') return 12; if(r==='K') return 13; return Number(r); }

function undo(){
  const h = state.history.pop(); if(!h) return;
  // simple undo handling for moves/draw
  if(h.type==='draw'){
    state.stock.push(h.card); state.waste.pop();
  } else if(h.type==='recycle'){
    state.waste = state.stock.reverse().map(c=>c); state.stock=[];
  } else if(h.type==='move'){
    // naive reversing for two cases
    if(h.from==='waste'){
      // moved from waste to somewhere
      if(h.to.zone==='table'){
        state.table[h.to.idx].pop(); state.waste.push(h.card);
      } else if(h.to.zone==='foundation'){
        state.foundations[h.to.idx].pop(); state.waste.push(h.card); state.score-=10;
      }
    } else if(h.from.zone==='table' && h.to.zone==='table'){
      const moved = state.table[h.to.idx].splice(state.table[h.to.idx].length - h.cards.length, h.cards.length);
      // Jos edellinen kortti käännettiin automaattisesti, käännetään se takaisin piiloon
      const last = state.table[h.from.idx][state.table[h.from.idx].length - 1];
      if (last && last.wasAutoFlipped) { // Tarvitset lipun tälle
          last.faceUp = false;
          delete last.wasAutoFlipped;
      }
      state.table[h.from.idx] = state.table[h.from.idx].concat(moved);
      state.score-=5;
    } else if(h.from.zone==='table' && h.to.zone==='foundation'){
      const card = state.foundations[h.to.idx].pop();
      // Tarkistetaan kääntö täälläkin
      const last = state.table[h.from.idx][state.table[h.from.idx].length - 1];
      if (last && last.wasAutoFlipped) {
          last.faceUp = false;
          delete last.wasAutoFlipped;
      }
      state.table[h.from.idx].push({card: card, faceUp:true}); 
      state.score-=10;
    }
  }
  render();
}

// Simple helper: clicking on a foundation's top card could try to move it somewhere - omitted for brevity

// Note: This is an initial, minimal playable implementation. Improvements: drag-and-drop, auto-move to foundations, better undo, win detection, animations, sound, tests.
