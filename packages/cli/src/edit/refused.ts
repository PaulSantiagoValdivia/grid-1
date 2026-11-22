/** A change that can't be made, saying why and what would fit. Nothing is half done. */
export class EditRefused extends Error {
  override readonly name = 'EditRefused'
}
