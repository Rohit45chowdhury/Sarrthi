import React, { useState } from 'react'
import axios from 'axios'

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000'

const LABELS = ['', 'Bahut kharab', 'Theek nahi', 'Theek tha', 'Accha tha', 'Bahut badhiya']

// Props:
//   ride      -> ride object (needs _id, captain.fullname, fare)
//   onClose   -> called after submit or skip
const RatingPopUp = ({ ride, onClose }) => {
  const [value, setValue] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const active = hover || value
  const captainName = ride?.captain?.fullname?.firstname || 'your captain'

  const submit = async () => {
    if (!value) {
      setError('Pick a star rating first')
      return
    }
    try {
      setLoading(true)
      setError('')
      await axios.post(
        `${BASE_URL}/rides/rate`,
        { rideId: ride._id, value, comment: comment.trim() },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save rating. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rate your ride"
        className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#12334A] text-lg font-semibold text-white">
            {captainName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#12334A]">Ride complete</h2>
            <p className="text-sm text-gray-500">How was your ride with {captainName}?</p>
          </div>
          {ride?.fare != null && (
            <p className="ml-auto text-xl font-semibold text-[#12334A]">₹{ride.fare}</p>
          )}
        </div>

        <div
          className="mt-6 flex justify-center gap-2"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setValue(n)}
              className={`text-4xl transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F15A24] ${
                n === value ? 'scale-110' : ''
              } ${n <= active ? 'text-[#F15A24]' : 'text-gray-300'}`}
            >
              <i className={n <= active ? 'ri-star-fill' : 'ri-star-line'}></i>
            </button>
          ))}
        </div>
        <p className="mt-2 h-5 text-center text-sm font-medium text-[#12334A]">
          {LABELS[active]}
        </p>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Kuch likhna hai? (optional)"
          className="mt-4 w-full resize-none rounded-xl bg-[#F5F7FA] p-3 text-sm outline-none focus:ring-2 focus:ring-[#12334A]"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-[#F5F7FA] py-3 font-medium text-[#12334A]"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#F15A24] py-3 font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Submit rating'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RatingPopUp