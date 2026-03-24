import axios from "axios";

export const axiosInstance = axios.create({
    baseURL: import.meta.MODE === "development" ? "http://localhost:8080/api" : "https://chatflow-zvul.onrender.com/api",
    withCredentials: true,
});