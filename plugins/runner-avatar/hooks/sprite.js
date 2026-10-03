// Draws one avatar in a region of its own, and tells the hooks module when it is clicked.
// This file runs on the drawing side: it has no mods API, only `surface`.
export default function Sprite(props, surface) {
  const { Box, Text } = surface.elements
  surface.onPointer((event) => {
    if (event.type === 'down') surface.post({ poke: true })
  })
  return Box({
    flexDirection: 'column',
    children: props.rows.map((row, i) =>
      Box({
        paddingLeft: props.offsets[i],
        children: [Text({ color: props.color, dimColor: props.isDim, children: [row] })],
      }),
    ),
  })
}
