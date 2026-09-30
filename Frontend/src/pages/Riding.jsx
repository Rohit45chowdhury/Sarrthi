import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import LiveTracking from '../components/LiveTracking'

const Riding = () => {

    const location = useLocation()

    const { ride } = location.state || {}

    console.log("Riding Page Ride:", ride)

    return (
        <div className="h-screen w-full bg-white overflow-hidden relative">

            {/* ================= MAP ================= */}
            <div className="h-[50vh] w-full relative">

                <LiveTracking />

            </div>


            {/* ================= HOME BUTTON ================= */}
            <Link
                to="/home"
                className="fixed z-50 right-4 top-4 h-10 w-10 bg-white shadow-lg flex items-center justify-center rounded-full"
            >
                <i className="text-lg font-medium ri-home-5-line"></i>
            </Link>


            {/* ================= RIDE DETAILS ================= */}
            <div className="h-[50vh] bg-white p-4 overflow-y-auto">

                {/* Captain Details */}
                <div className="flex items-center justify-between">

                    <img
                        className="h-12 w-16 object-cover rounded-lg"
                        src="https://swyft.pl/wp-content/uploads/2023/05/how-many-people-can-a-uberx-take.jpg"
                        alt="Vehicle"
                    />

                    <div className="text-right">

                        <h2 className="text-lg font-medium capitalize">
                            {ride?.captain?.fullname?.firstname || "Captain"}
                        </h2>

                        <h4 className="text-xl font-semibold">
                            {ride?.captain?.vehicle?.plate || "WB-00-XX-0000"}
                        </h4>

                        <p className="text-sm text-gray-600">
                            {ride?.captain?.vehicle?.vehicleType || "Maruti Suzuki Alto"}
                        </p>

                    </div>

                </div>


                {/* ================= LOCATION ================= */}

                <div className="w-full mt-5">

                    {/* Destination */}
                    <div className="flex items-center gap-5 p-3 border-b-2">

                        <i className="text-lg ri-map-pin-2-fill"></i>

                        <div>

                            <h3 className="text-lg font-medium">
                                Destination
                            </h3>

                            <p className="text-sm mt-1 text-gray-600">
                                {ride?.destination || "Destination not available"}
                            </p>

                        </div>

                    </div>


                    {/* Fare */}
                    <div className="flex items-center gap-5 p-3">

                        <i className="text-lg ri-currency-line"></i>

                        <div>

                            <h3 className="text-lg font-medium">
                                ₹{ride?.fare || 0}
                            </h3>

                            <p className="text-sm mt-1 text-gray-600">
                                Cash Payment
                            </p>

                        </div>

                    </div>

                </div>


                {/* Payment Button */}
                <button
                    className="w-full mt-5 bg-green-600 hover:bg-green-700 text-white font-semibold p-3 rounded-lg"
                >
                    Make a Payment
                </button>

            </div>

        </div>
    )
}

export default Riding