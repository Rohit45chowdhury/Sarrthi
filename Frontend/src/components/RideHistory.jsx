import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const PAGE_SIZE = 10

const STATUS_STYLE = {
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600'
}

const formatDate = iso => {

    if (!iso) return ''

    return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    })
}

/*
 * role = 'user'    -> GET /rides/history
 * role = 'captain' -> GET /rides/captain/history
 */
const RideHistory = ({ role = 'user', onClose }) => {

    const [rides, setRides] = useState([])
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const endpoint =
        role === 'captain'
            ? '/rides/captain/history'
            : '/rides/history'

    const load = useCallback(async nextPage => {

        setLoading(true)
        setError('')

        try {

            const { data } = await axios.get(
                `${BASE_URL}${endpoint}`,
                {
                    params: { page: nextPage, limit: PAGE_SIZE },
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`
                    }
                }
            )

            const list = Array.isArray(data?.rides) ? data.rides : []

            setRides(prev => (nextPage === 1 ? list : [...prev, ...list]))
            setHasMore(Boolean(data?.hasMore))
            setPage(nextPage)

        } catch (err) {

            console.error(
                'RIDE HISTORY ERROR:',
                err.response?.data || err.message
            )

            setError(
                err.response?.data?.message ||
                'Unable to load ride history.'
            )

        } finally {

            setLoading(false)
        }

    }, [endpoint])

    useEffect(() => {
        load(1)
    }, [load])

    return (

        <div className="fixed inset-0 z-[80] flex items-end justify-center">

            {/* BACKDROP */}
            <div
                className="absolute inset-0 bg-[#12334A]/40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* SHEET */}
            <div
                role="dialog"
                aria-label="Ride history"
                className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl lg:max-w-xl"
            >

                <span className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-300" />

                {/* HEADER */}
                <div className="flex items-center justify-between px-5 pb-3 pt-4 sm:px-8">

                    <div className="flex items-center gap-3">

                        <span className="h-7 w-2 rounded-full bg-[#F15A24]" />

                        <h2 className="text-2xl font-extrabold text-[#12334A]">
                            Past rides
                        </h2>

                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close ride history"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-[#12334A] transition-colors hover:bg-[#F15A24] hover:text-white active:scale-95"
                    >
                        <i className="text-xl ri-close-line"></i>
                    </button>

                </div>

                {/* LIST */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8">

                    {error && (
                        <div className="mb-3 rounded-xl bg-red-50 p-4 text-sm text-red-600">
                            {error}
                            <button
                                type="button"
                                onClick={() => load(1)}
                                className="ml-2 font-semibold underline"
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {!loading && !error && rides.length === 0 && (
                        <div className="rounded-xl bg-gray-100 p-6 text-center">
                            <p className="font-semibold text-[#12334A]">
                                No past rides yet
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                                Completed rides will show up here.
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">

                        {rides.map(item => (

                            <div
                                key={item._id}
                                className="rounded-xl bg-gray-100 p-4"
                            >

                                <div className="flex items-center justify-between gap-3">

                                    <p className="text-xs text-gray-500">
                                        {formatDate(item.createdAt)}
                                    </p>

                                    <span
                                        className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[item.status] || 'bg-gray-200 text-gray-600'}`}
                                    >
                                        {item.status}
                                    </span>

                                </div>

                                <div className="mt-3 flex gap-3">

                                    <div className="flex flex-col items-center pt-1">
                                        <span className="h-2.5 w-2.5 rounded-full bg-[#12334A]" />
                                        <span className="my-1 w-0.5 flex-1 bg-[#12334A]/30" />
                                        <span className="h-2.5 w-2.5 rounded-full bg-[#F15A24]" />
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-3">
                                        <p className="line-clamp-2 text-sm font-medium text-[#12334A]">
                                            {item.pickup}
                                        </p>
                                        <p className="line-clamp-2 text-sm font-medium text-[#12334A]">
                                            {item.destination}
                                        </p>
                                    </div>

                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">

                                    <p className="text-sm capitalize text-gray-500">
                                        {item.vehicleType}
                                        {item.rating?.value
                                            ? ` · ${item.rating.value}/5`
                                            : ''}
                                    </p>

                                    <p className="text-lg font-extrabold text-[#12334A]">
                                        ₹{item.fare}
                                    </p>

                                </div>

                            </div>

                        ))}

                    </div>

                    {loading && (
                        <p className="py-4 text-center text-sm text-gray-500">
                            Loading rides...
                        </p>
                    )}

                    {hasMore && !loading && (
                        <button
                            type="button"
                            onClick={() => load(page + 1)}
                            className="mt-4 w-full rounded-xl bg-[#12334A] py-3 font-semibold text-white shadow-md shadow-[#12334A]/15 transition-all duration-300 hover:bg-[#F15A24] active:scale-[0.98]"
                        >
                            Load more
                        </button>
                    )}

                </div>

            </div>

        </div>
    )
}

export default RideHistory