<script context="module">
  export const pageConfig = { title: 'Accordion & Carousel' };
</script>

<script>
  import {
    Accordion,
    AccordionItem,
    Carousel,
    CarouselSlide,
  } from 'tessera-learn';
</script>

<h1>Accordion & Carousel</h1>

<h2>Accordion</h2>

<Accordion>
  <AccordionItem title="First Item">
    <p>Content of the first accordion item.</p>
  </AccordionItem>
  <AccordionItem title="Second Item">
    <p>Content of the second accordion item.</p>
  </AccordionItem>
  <AccordionItem title="Third Item">
    <p>Content of the third accordion item.</p>
  </AccordionItem>
</Accordion>

<h2>Carousel</h2>

<Carousel>
  <CarouselSlide>
    <h3>Slide 1</h3>
    <p>First slide content.</p>
  </CarouselSlide>
  <CarouselSlide>
    <h3>Slide 2</h3>
    <p>Second slide content.</p>
  </CarouselSlide>
  <CarouselSlide>
    <h3>Slide 3</h3>
    <p>Third slide content.</p>
  </CarouselSlide>
</Carousel>
