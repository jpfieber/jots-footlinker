export const formatDate = (date, format) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const weekday = d.getDay();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthsShort = months.map(m => m.slice(0, 3));
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdaysShort = weekdays.map(w => w.slice(0, 3));
  const pad = num => num.toString().padStart(2, "0");
  const tokens = {
    "dddd": weekdays[weekday],
    "ddd": weekdaysShort[weekday],
    "dd": pad(day),
    "d": day.toString(),
    "mmmm": months[month],
    "mmm": monthsShort[month],
    "mm": pad(month + 1),
    "m": (month + 1).toString(),
    "yyyy": year.toString(),
    "yy": year.toString().slice(-2)
  };
  const sortedTokens = Object.keys(tokens).sort((a, b) => b.length - a.length);
  let result = format.toLowerCase();
  const replacements = new Map();
  sortedTokens.forEach((token, index) => {
    const placeholder = `__${index}__`;
    replacements.set(placeholder, tokens[token]);
    result = result.replace(new RegExp(token, "gi"), placeholder);
  });
  replacements.forEach((value, placeholder) => {
    result = result.replace(new RegExp(placeholder, "g"), value);
  });
  return result;
};