# Fly Image Processing App

To run:
* `npm install`
* `npm start`

Demo URLs:
* http://localhost:3000/content/images/2018/01/ghostzapimg--3-.jpg?w_url=/assets/img/ghostpro.svg&w_pos=southwest&w_pad=10%25&w_w=20%25&w_bg=rgba(128,128,255,0.5)
* http://localhost:3000/content/images/2018/01/ghostzapimg--3-.jpg?w_url=/assets/img/ghostpro.svg&w_pos=northeast&w_pad=10%25&w_w=20%25&w_bg=rgba(255,128,128,0.5)

## URL options

##### Image
* Size: leave either of these blank to auto scale a dimension
  * **`w`**: Width in pixels or percent (`200`, `200px`, `50%`)
  * **`h`**: Height in pixels or percent (`140`, `140px`, `50%`)
* **`f`**: desired output format
##### Watermark
* **`w_url`**: URL to the watermark image (like `/watermarks/blah.png`)
* **`w_bg`**: Background color for watermark (like `transparent` or `rgba(128,128,0,0.5)`)
* **`w_pos`**: Watermark Position: `north`, `south`, `east`, `west` ...
* **`w_pad`**: padding around watermark. If a bg color is specified, padding expands the colored canvas

