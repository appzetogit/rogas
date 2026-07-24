import React, { createContext, useContext, useState, useEffect } from 'react';

const PantryCartContext = createContext();

export function PantryCartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('pantry_cart');
      return saved ? JSON.parse(saved) : { vendorId: null, items: [] };
    } catch {
      return { vendorId: null, items: [] };
    }
  });

  useEffect(() => {
    localStorage.setItem('pantry_cart', JSON.stringify(cart));
  }, [cart]);

  const addItem = (item, vendorId) => {
    setCart(prev => {
      // If adding an item from a different vendor, clear the cart or block
      if (prev.vendorId && prev.vendorId !== vendorId && prev.items.length > 0) {
        // Option 1: Auto-clear cart and switch vendor
        // Option 2: Throw error or show toast. Let's auto-clear for simplicity
        prev = { vendorId: null, items: [] };
      }

      const existingIndex = prev.items.findIndex(i => i.pantryItemId === item._id);
      let newItems = [...prev.items];
      
      if (existingIndex >= 0) {
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1
        };
      } else {
        newItems.push({
          pantryItemId: item._id,
          title: item.title,
          price: item.price,
          quantity: 1,
          vendorId // keep for reference
        });
      }

      return { vendorId, items: newItems };
    });
  };

  const removeItem = (itemId) => {
    setCart(prev => {
      const existingIndex = prev.items.findIndex(i => i.pantryItemId === itemId);
      if (existingIndex === -1) return prev;

      let newItems = [...prev.items];
      if (newItems[existingIndex].quantity > 1) {
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity - 1
        };
      } else {
        newItems.splice(existingIndex, 1);
      }

      return {
        vendorId: newItems.length === 0 ? null : prev.vendorId,
        items: newItems
      };
    });
  };
  
  const getItemQuantity = (itemId) => {
    const item = cart.items.find(i => i.pantryItemId === itemId);
    return item ? item.quantity : 0;
  };

  const clearCart = () => {
    setCart({ vendorId: null, items: [] });
  };

  const cartTotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <PantryCartContext.Provider value={{ cart, addItem, removeItem, clearCart, getItemQuantity, cartTotal, totalItems }}>
      {children}
    </PantryCartContext.Provider>
  );
}

export function usePantryCart() {
  return useContext(PantryCartContext);
}
