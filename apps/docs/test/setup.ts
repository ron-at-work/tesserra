import '@testing-library/dom';

Object.assign(navigator, { clipboard: { writeText: async () => undefined } });
window.scrollTo = () => undefined;
