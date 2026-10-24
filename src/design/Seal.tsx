interface Props {
  released?: boolean
  size?: number
}

export function Seal({ released = false, size = 96 }: Props) {
  return (
    <img
      src={released ? '/assets/brand/seal-released.svg' : '/assets/brand/seal-locked.svg'}
      width={size}
      height={size}
      alt={released ? 'Paid as promised' : 'Locked'}
      className={released ? 'seal-stamp' : ''}
    />
  )
}
