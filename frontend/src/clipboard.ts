export async function copyToClipboard(value: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers deny clipboard access even in a secure context. Fall back below.
    }
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();

  if (!copied) throw new Error("Copy failed");
}
