// Локальный экспорт: share sheet на iOS/Android, скачивание на десктопе.
// Каскад выбран под установленную iOS-PWA: navigator.share({files}) — единственный
// надёжный способ отдать файл из standalone-режима; <a download> там не работает.

function showToast(message) {
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function isShareCancel(error) {
  return error && (error.name === "AbortError" || error.name === "NotAllowedError");
}

async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      if (isShareCancel(error)) return;
      console.warn(error);
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Отчёт скопирован в буфер обмена");
  } catch {
    showToast("Не удалось поделиться отчётом");
  }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function shareOrDownloadFile(filename, mimeType, text) {
  const file = new File([text], filename, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (isShareCancel(error)) return;
      console.warn(error);
    }
  }
  try {
    downloadBlob(filename, new Blob([text], { type: mimeType }));
    showToast(`Файл ${filename} сохраняется`);
  } catch (error) {
    console.warn(error);
    await shareText(filename, text);
  }
}

window.exportUtils = { shareText, shareOrDownloadFile, showToast };
