import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import Card from './Card';

// Threshold for when to switch to virtualized rendering
const VIRTUALIZATION_THRESHOLD = 15;
const CARD_HEIGHT = 140; // Approximate height of a card in pixels
const LIST_PADDING = 8;

// Memoized card row component
const CardRow = memo(({ data, index, style }) => {
  const { 
    cards, 
    onCardClick, 
    onDeleteCard, 
    onCardDragStart, 
    onCardDragEnd,
    getCardClass,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop
  } = data;
  
  const card = cards[index];
  if (!card) return null;

  return (
    <div
      style={{
        ...style,
        paddingBottom: LIST_PADDING
      }}
      className={getCardClass(card)}
      draggable
      onDragStart={(e) => onCardDragStart(e, card)}
      onDragOver={(e) => handleCardDragOver(e, card)}
      onDragLeave={(e) => handleCardDragLeave(e, card)}
      onDrop={(e) => handleCardDrop(e, card)}
      onDragEnd={onCardDragEnd}
    >
      <Card
        card={card}
        onClick={() => onCardClick(card)}
        onDelete={onDeleteCard}
      />
    </div>
  );
});

CardRow.displayName = 'CardRow';

// Regular (non-virtualized) card list for small lists
const RegularCardList = memo(({ 
  cards, 
  onCardClick, 
  onDeleteCard,
  onCardDragStart,
  onCardDragEnd,
  getCardClass,
  handleCardDragOver,
  handleCardDragLeave,
  handleCardDrop
}) => {
  return (
    <>
      {cards.map(card => (
        <div
          key={card._id}
          className={getCardClass(card)}
          draggable
          onDragStart={(e) => onCardDragStart(e, card)}
          onDragOver={(e) => handleCardDragOver(e, card)}
          onDragLeave={(e) => handleCardDragLeave(e, card)}
          onDrop={(e) => handleCardDrop(e, card)}
          onDragEnd={onCardDragEnd}
        >
          <Card
            card={card}
            onClick={() => onCardClick(card)}
            onDelete={onDeleteCard}
          />
        </div>
      ))}
    </>
  );
});

RegularCardList.displayName = 'RegularCardList';

// Main virtualized card list component
const VirtualizedCardList = memo(({ 
  cards, 
  onCardClick, 
  onDeleteCard,
  onCardDragStart,
  onCardDragEnd,
  getCardClass,
  handleCardDragOver,
  handleCardDragLeave,
  handleCardDrop,
  listHeight
}) => {
  const listRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(listHeight || 400);
  
  // Calculate container height
  useEffect(() => {
    if (listHeight) {
      setContainerHeight(listHeight);
    }
  }, [listHeight]);

  // Memoize item data to prevent re-renders
  const itemData = useMemo(() => ({
    cards,
    onCardClick,
    onDeleteCard,
    onCardDragStart,
    onCardDragEnd,
    getCardClass,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop
  }), [cards, onCardClick, onDeleteCard, onCardDragStart, onCardDragEnd, getCardClass, handleCardDragOver, handleCardDragLeave, handleCardDrop]);

  // Use regular rendering for small lists
  if (cards.length < VIRTUALIZATION_THRESHOLD) {
    return (
      <div className="space-y-2">
        <RegularCardList {...itemData} />
      </div>
    );
  }

  // Use virtualized rendering for large lists
  const listContentHeight = cards.length * (CARD_HEIGHT + LIST_PADDING);
  const finalHeight = Math.min(containerHeight, listContentHeight);

  return (
    <List
      ref={listRef}
      height={finalHeight}
      itemCount={cards.length}
      itemSize={CARD_HEIGHT + LIST_PADDING}
      itemData={itemData}
      width="100%"
      overscanCount={3}
      className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
    >
      {CardRow}
    </List>
  );
});

VirtualizedCardList.displayName = 'VirtualizedCardList';

export default VirtualizedCardList;
export { VIRTUALIZATION_THRESHOLD, CARD_HEIGHT };
