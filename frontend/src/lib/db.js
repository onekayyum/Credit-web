import Dexie from 'dexie';

export const db = new Dexie('udhaar_shop_db');

db.version(1).stores({
  users: '++id,username',
  sessions: 'id,username,createdAt',
  customers: '++id,name,mobile,uniqueId,indexNumber,trustLevel,balance',
  products: '++id,name,barcode,price',
  transactions: '++id,customerId,total,timestamp,dueDate,type',
  transaction_items: '++id,transactionId,productId,barcode,quantity,price',
  payments: '++id,customerId,amount,timestamp,method'
});

export async function seedDefaults() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.add({ username: 'admin', password: 'admin123' });
  }
}

export function nowIso() {
  return new Date().toISOString();
}
