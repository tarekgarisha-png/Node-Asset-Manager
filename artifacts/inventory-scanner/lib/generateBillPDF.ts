function exportToPDF() {
  // 1. Select the content you want to save (e.g., the current bill)
  const printContent = document.getElementById("bill-area").innerHTML;
  const originalContent = document.body.innerHTML;

  // 2. Temporarily replace the page content with just the bill
  document.body.innerHTML = `
    <html>
      <head><title>Receipt</title></head>
      <body style="padding: 20px; font-family: sans-serif;">
        <h2 style="text-align: center;">Pharmacy Receipt</h2>
        ${printContent}
      </body>
    </html>
  `;

  // 3. Trigger the phone's native print/save menu
  window.print();

  // 4. Restore the app screen after the print menu closes
  document.body.innerHTML = originalContent;
  window.location.reload(); // Refreshes to ensure all buttons work again
}
