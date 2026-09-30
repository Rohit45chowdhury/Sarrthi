import React, {
    useContext,
    useEffect,
    useState
} from 'react'

import {
    CaptainDataContext
} from '../context/CapatainContext'

import {
    useNavigate
} from 'react-router-dom'

import axios from 'axios'


const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'


const CaptainProtectWrapper = ({
    children
}) => {

    const navigate =
        useNavigate()

    const {
        updateCaptain
    } = useContext(
        CaptainDataContext
    )

    const [
        isLoading,
        setIsLoading
    ] = useState(true)


    useEffect(() => {

        let mounted = true


        const fetchCaptainProfile =
            async () => {

                const token =
                    localStorage.getItem(
                        'token'
                    )


                // =================================================
                // NO TOKEN
                // =================================================

                if (!token) {

                    if (mounted) {
                        setIsLoading(false)
                    }

                    navigate(
                        '/captain-login',
                        {
                            replace: true
                        }
                    )

                    return
                }


                // =================================================
                // GET CAPTAIN PROFILE
                // =================================================

                try {

                    const response =
                        await axios.get(
                            `${BASE_URL}/captains/profile`,
                            {
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`
                                }
                            }
                        )


                    if (
                        response.status !== 200
                    ) {

                        throw new Error(
                            'Unable to get captain profile'
                        )
                    }


                    const captainData =
                        response.data.captain ||
                        response.data.user ||
                        response.data


                    if (
                        captainData &&
                        mounted
                    ) {

                        updateCaptain(
                            captainData
                        )
                    }


                    if (mounted) {

                        setIsLoading(
                            false
                        )
                    }


                } catch (error) {

                    console.error(
                        'Captain profile error:',
                        error.response?.data ||
                        error.message
                    )


                    localStorage.removeItem(
                        'token'
                    )

                    localStorage.removeItem(
                        'captain'
                    )


                    if (mounted) {

                        setIsLoading(
                            false
                        )

                        navigate(
                            '/captain-login',
                            {
                                replace: true
                            }
                        )
                    }
                }
            }


        fetchCaptainProfile()


        return () => {

            mounted = false

        }

    }, [
        navigate,
        updateCaptain
    ])


    // =====================================================
    // LOADING SCREEN
    // =====================================================

    if (isLoading) {

        return (
            <div className='h-screen flex items-center justify-center'>

                <p className='text-gray-500'>
                    Loading captain...
                </p>

            </div>
        )
    }


    return (
        <>
            {children}
        </>
    )
}


export default CaptainProtectWrapper