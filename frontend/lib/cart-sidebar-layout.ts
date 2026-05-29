/** Narrow Amazon-style cart column (~14% viewport on typical laptops). */
export const CART_SIDEBAR_WIDTH_REM = 13.5;

/** Visible on lg+ (1024px). Portaled to document.body so nothing clips it. */
export const cartSidebarFixedClass =
  "fixed right-0 z-[45] flex w-[13.5rem] max-lg:hidden flex-col border-l border-stone-200 bg-white shadow-[-4px_0_16px_rgba(0,0,0,0.06)]";

export const cartSidebarTopClass = "top-24 h-[calc(100vh-6rem)]";

/** Reserve space so PDP content does not sit under the fixed rail */
export const cartSidebarContentPadClass = "lg:pr-[14.5rem]";

export const cartSidebarWhatsAppRightClass = "lg:right-[14.5rem]";
