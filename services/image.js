const generateImage = async (prompt, env) => {
  const {
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_API_KEY,
  } = env

  if (
    !CLOUDINARY_CLOUD_NAME ||
    !CLOUDFLARE_ACCOUNT_ID ||
    !CLOUDINARY_API_SECRET ||
    !CLOUDINARY_API_KEY
  ) {
    throw new Error('Missing Cloudinary environment variables')
  }
  const API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`

  // FLUX.2 takes multipart form data and returns { image: base64 }.
  // Keep width x height at or under 1 MP: that is billed at the flat
  // "first MP" rate and stays well inside the free daily neuron allocation.
  const form = new FormData()
  form.append(
    'prompt',
    `Professional food photograph of ${prompt}, served on a plate on the table of a cosy restaurant. Photorealistic, highly detailed, warm natural light, sharp focus. No text, no watermarks.`,
  )
  form.append('width', '1536')
  form.append('height', '640')

  const formRequest = new Response(form)
  const { image } = await env.AI.run('@cf/black-forest-labs/flux-2-klein-9b', {
    multipart: {
      body: formRequest.body,
      contentType: formRequest.headers.get('content-type'),
    },
  })

  if (!image) {
    throw new Error('Image generation returned no image')
  }
  const dataUri = `data:image/jpeg;base64,${image}`

  // Prepare upload parameters
  const timestamp = Math.floor(Date.now() / 1000)
  const uploadParams = {
    timestamp: timestamp,
    public_id: 'menuvandedag',
    folder: 'budamenu',
    overwrite: true,
  }

  // Create signature for authentication
  const excludedParams = ['file', 'cloud_name', 'resource_type', 'api_key']
  const sortedParams = Object.keys(uploadParams)
    .filter((key) => !excludedParams.includes(key))
    .sort()
    .map((key) => `${key}=${uploadParams[key]}`)
    .join('&')

  const signatureString = `${sortedParams}${CLOUDINARY_API_SECRET}`
  const signature = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(signatureString),
  )
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Upload to Cloudinary
  const formData = new FormData()
  formData.append('file', dataUri)
  formData.append('api_key', CLOUDINARY_API_KEY)
  formData.append('signature', signatureHex)

  // Add all upload parameters to form data
  Object.entries(uploadParams).forEach(([key, value]) => {
    formData.append(key, value)
  })

  const cloudinaryResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  )

  if (!cloudinaryResponse.ok) {
    throw new Error(
      `Cloudinary upload failed: ${cloudinaryResponse.statusText}`,
    )
  }

  const result = await cloudinaryResponse.json()
  return result.url
}

export { generateImage }
