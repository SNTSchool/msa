const { createCanvas } = require('canvas');

function generateReceipt(username, amount) {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '20px Arial';
  ctx.fillText(`ใบเสร็จสำหรับ ${username}`, 50, 50);
  ctx.fillText(`ยอดรวม: ${amount} บาท`, 50, 100);

  return canvas.toBuffer('image/png');
}

module.exports = { generateReceipt };
