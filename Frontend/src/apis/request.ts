import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  timeout: 1200000,
  headers: {
    post: {
      'Access-Control-Allow-Origin': '*',
    },
  },
})

request.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

request.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  },
)

export default request
