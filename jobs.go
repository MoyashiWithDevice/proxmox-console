package main

import "sync"

type Job struct {
	Status     string
	IP         string
	VMID       int
	LogPath    string
	Workdir    string
	NodeName   string
	Servername string
	OwnerID    string
}

var jobs sync.Map