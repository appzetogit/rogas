const INITIAL_DRIVER_STATS = {
  todayDeliveries: 8,
  todayEarned: 144,
  todayTips: 18,
  guaranteeTopUp: 13.5,
  weeklyBonusProgress: 4,
  // 4 orders out of 10 done (40%)
  hoursLogged: 32.5,
  hoursTarget: 40,
  rating: 4.9,
  online: true
};
const INITIAL_ORDERS = [
  {
    id: "order_maria_kitchen",
    orderNumber: "FD-4492",
    vendorName: "Maria's Kitchen",
    pickupAddress: "ul. Nowy Świat 24, Warsaw",
    deliveryAddress: "ul. Grójecka 12, Apt 42 • Floor 4",
    customerName: "Anna Kowalska",
    customerNote: "Please leave by the door if I don't answer the intercom within 30 seconds. Building code: 1234#.",
    customerLat: 52.2120,
    customerLng: 20.9790,
    items: [
      { id: "item_1", name: "Order #8821 - Alex R. (2x Organic Veggie Box)", quantity: 2, checked: false },
      { id: "item_2", name: "Order #8824 - Sarah L. (1x Seasonal Fruit Set)", quantity: 1, checked: false },
      { id: "item_3", name: "Order #8827 - James K. (3x Dairy Fresh Packs)", quantity: 3, checked: false },
      { id: "item_4", name: "Order #4492 - Warm Restaurant Meal Box", quantity: 1, checked: false }
    ],
    pin: "4901",
    paymentMethod: "CASH",
    cashAmount: 18,
    status: "ready_for_pickup"
  },
  {
    id: "order_green_grocer",
    orderNumber: "FD-8824",
    vendorName: "The Green Grocer",
    pickupAddress: "ul. Grójecka 12, Warsaw",
    deliveryAddress: "ul. Filtrowa 62, Apt 10 • Floor 1",
    customerName: "Jan Kowalski",
    customerNote: "Ring the bell. Leave on the mat.",
    customerLat: 52.2150,
    customerLng: 20.9830,
    items: [
      { id: "gg_item_1", name: "Order #8824 - Seasonal Fruit Set", quantity: 1, checked: false }
    ],
    pin: "1234",
    paymentMethod: "CARD",
    cashAmount: 0,
    status: "ready_for_pickup"
  },
  {
    id: "order_health_hub",
    orderNumber: "FD-8827",
    vendorName: "Health Hub Pharmacy",
    pickupAddress: "ul. Banacha 2, Warsaw",
    deliveryAddress: "ul. Banacha 2, Apt 5 • Floor 2",
    customerName: "Marek Nowak",
    customerNote: "Gate code is 9876.",
    customerLat: 52.2190,
    customerLng: 20.9860,
    items: [
      { id: "hh_item_1", name: "Order #8827 - Dairy Fresh Packs", quantity: 3, checked: false }
    ],
    pin: "1234",
    paymentMethod: "CASH",
    cashAmount: 45,
    status: "ready_for_pickup"
  },
  {
    id: "order_apt_42",
    orderNumber: "FD-4493",
    vendorName: "Central Warehouse",
    pickupAddress: "ul. Bitwy Warszawskiej, Warsaw",
    deliveryAddress: "ul. Bitwy Warszawskiej 1920 r. 8, Apt 120 • Floor 11",
    customerName: "Zofia Wisniewska",
    customerNote: "Please knock on the door.",
    customerLat: 52.2210,
    customerLng: 20.9920,
    items: [
      { id: "apt_item_1", name: "Order #4493 - Veggie Dinner Meal", quantity: 1, checked: false }
    ],
    pin: "1234",
    paymentMethod: "CARD",
    cashAmount: 0,
    status: "ready_for_pickup"
  }
];
const INITIAL_STOPS = [
  {
    id: "stop_1",
    type: "P",
    name: "Maria's Kitchen",
    address: "882 West 12th St, Suite 400",
    status: "READY",
    orderId: "order_maria_kitchen",
    vendorLat: 52.2120,
    vendorLng: 20.9790
  },
  {
    id: "stop_2",
    type: "D",
    name: "The Green Grocer",
    address: "124 Oak Avenue, East Wing",
    status: "WAITING",
    orderId: "order_green_grocer",
    customerLat: 52.2150,
    customerLng: 20.9830
  },
  {
    id: "stop_3",
    type: "D",
    name: "Health Hub Pharmacy",
    address: "520 Medical Blvd",
    status: "QUEUED",
    orderId: "order_health_hub",
    customerLat: 52.2190,
    customerLng: 20.9860
  },
  {
    id: "stop_4",
    type: "P",
    name: "Central Warehouse",
    address: "Distribution Center A",
    status: "QUEUED",
    orderId: "order_central_warehouse",
    vendorLat: 52.2080,
    vendorLng: 20.9720
  },
  {
    id: "stop_5",
    type: "D",
    name: "Apartment Complex 42",
    address: "1001 Sunset Blvd",
    status: "QUEUED",
    orderId: "order_apt_42",
    customerLat: 52.2210,
    customerLng: 20.9920
  }
];
const INITIAL_SHIFTS = [
  {
    id: "shift_mon",
    day: 12,
    dayName: "MON",
    name: "Morning Refresh",
    timeSlot: "08:00 - 14:00",
    durationText: "6h total",
    status: "done"
  },
  {
    id: "shift_tue",
    day: 13,
    dayName: "TUE",
    name: "Afternoon Sprint",
    timeSlot: "14:00 - 20:00",
    durationText: "In Progress",
    status: "active"
  },
  {
    id: "shift_wed",
    day: 14,
    dayName: "WED",
    name: "Full Day Shift",
    timeSlot: "09:00 - 18:00",
    durationText: "9h total",
    status: "scheduled"
  },
  {
    id: "shift_thu",
    day: 15,
    dayName: "THU",
    name: "Morning Refresh",
    timeSlot: "08:00 - 14:00",
    durationText: "6h total",
    status: "scheduled"
  },
  {
    id: "shift_fri",
    day: 16,
    dayName: "FRI",
    name: "Late Night Delivery",
    timeSlot: "18:00 - 00:00",
    durationText: "6h total",
    status: "scheduled"
  },
  {
    id: "shift_sat",
    day: 17,
    dayName: "SAT",
    name: "No shift today",
    timeSlot: "",
    durationText: "",
    status: "none"
  },
  {
    id: "shift_sun",
    day: 18,
    dayName: "SUN",
    name: "No shift today",
    timeSlot: "",
    durationText: "",
    status: "none"
  }
];
export {
  INITIAL_DRIVER_STATS,
  INITIAL_ORDERS,
  INITIAL_SHIFTS,
  INITIAL_STOPS
};
