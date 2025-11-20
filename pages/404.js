module.exports = (req, res) => {
  res.status(404).send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <title>404 - Page Not Found</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center">
  <div class="bg-white p-10 rounded-2xl shadow text-center">
    <h1 class="text-6xl font-bold text-red-500">404</h1>
    <p class="text-gray-700 mt-4 text-lg">ไม่พบหน้าที่คุณร้องขอ</p>
    <p class="text-gray-500 mt-2 text-sm">${req.method} ${req.originalUrl}</p>
    <a href="/" class="mt-6 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
      กลับหน้าแรก
    </a>
  </div>
</body>
</html>`);
};
