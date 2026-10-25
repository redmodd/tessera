---
'tessera-learn': minor
---

**Breaking:** the `.tessera-carousel-controls` wrapper is gone. Previous and Next sit either side of the slide, with the dots below. To upgrade, move custom CSS for the wrapper to `.tessera-carousel-arrow` and `.tessera-carousel-dots`.

Carousel works with a keyboard and a screen reader. Hidden slides can't take focus, and the dots are one Tab stop with arrow keys moving between them. Previous, Next and swipe announce the new slide. Arrow keys change slides only from the dots.
