/// <reference types="vite/client" />
/// <reference types="chrome" />

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
