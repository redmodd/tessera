<script module>
  export const pageConfig = { title: 'Overview' };
</script>

<script>
  import { Carousel, CarouselSlide, RevealModal } from 'tessera-learn';
</script>

<RevealModal title="Hidden modal heading">
  {#snippet trigger()}
    <button type="button">Open details</button>
  {/snippet}
  {#snippet content()}
    <p>Details</p>
  {/snippet}
</RevealModal>

<h2 data-testid="page-overview">Overview page</h2>

<Carousel>
  <CarouselSlide><p>First slide</p></CarouselSlide>
  <CarouselSlide><h1>Hidden slide heading</h1></CarouselSlide>
</Carousel>
