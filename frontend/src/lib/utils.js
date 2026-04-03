export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function formatCurrency(amount = 0) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

export function trustLevelFromBalance(balance = 0, creditLimit = 0) {
  const ratio = creditLimit ? balance / creditLimit : 0;
  if (ratio < 0.5) return 'good';
  if (ratio < 0.9) return 'average';
  return 'risky';
}

export function whatsappLink(phone, message) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
}
