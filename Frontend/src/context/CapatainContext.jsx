import {
    createContext,
    useEffect,
    useState,
    useCallback
} from 'react'

export const CaptainDataContext =
    createContext()

const CaptainContext = ({ children }) => {

    const [captain, setCaptain] =
        useState(null)

    const [isLoading, setIsLoading] =
        useState(true)

    const [error, setError] =
        useState(null)

    // =====================================================
    // LOAD CAPTAIN FROM LOCAL STORAGE
    // =====================================================

    useEffect(() => {

        const storedCaptain =
            localStorage.getItem('captain')

        if (storedCaptain) {

            try {

                const captainData =
                    JSON.parse(storedCaptain)

                setCaptain(captainData)

            } catch (error) {

                console.error(
                    'Invalid captain data:',
                    error
                )

                localStorage.removeItem(
                    'captain'
                )
            }
        }

        setIsLoading(false)

    }, [])

    // =====================================================
    // UPDATE CAPTAIN
    // useCallback is IMPORTANT
    // =====================================================

    const updateCaptain =
        useCallback((captainData) => {

            if (!captainData) {
                return
            }

            setCaptain(captainData)

            localStorage.setItem(
                'captain',
                JSON.stringify(captainData)
            )

        }, [])

    // =====================================================
    // LOGOUT CAPTAIN
    // =====================================================

    const logoutCaptain =
        useCallback(() => {

            setCaptain(null)

            localStorage.removeItem(
                'captain'
            )

            localStorage.removeItem(
                'token'
            )

        }, [])

    return (
        <CaptainDataContext.Provider
            value={{
                captain,
                setCaptain,
                updateCaptain,
                logoutCaptain,

                isLoading,
                setIsLoading,

                error,
                setError
            }}
        >
            {children}
        </CaptainDataContext.Provider>
    )
}

export default CaptainContext