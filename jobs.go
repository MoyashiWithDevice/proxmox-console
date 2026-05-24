package main

import "sync"

type Job struct {
	Status     string
	IP         string
	LogPath    string
	Workdir    string
	Servername string
	OwnerID    string
}

var jobs sync.Map