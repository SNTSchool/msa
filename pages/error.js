module.exports = (err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8"/>
  <title>500 - Internal Server Error</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center">
  <div class="bg-white p-10 rounded-2xl shadow text-center">
    <h1 class="text-5xl font-bold text-red-600">500</h1>
    <p class="text-gray-700 mt-4 text-lg">เกิดข้อผิดพลาดในเซิร์ฟเวอร์</p>
    <a href="/" class="mt-6 inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
      กลับหน้าแรก
    </a>
  </div>
</body>
</html>`);
};
